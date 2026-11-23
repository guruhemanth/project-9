import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHttpProxy from '@fastify/http-proxy';
import fastifyJwt from '@fastify/jwt';
import {
  validateEnv,
  createGatewayEnvSchema,
  buildCorsOptions,
  registerCentralizedErrorHandler,
  loggerRedactionConfig,
  signInternalToken,
} from '@caterconnect/shared';
import { registerOpsRoutes } from './ops-router';

// Public endpoints that do NOT require a JWT token (exact path / pattern match)
const PUBLIC_EXACT_ROUTES = new Set([
  '/health',
  '/ready',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/google',
  '/api/auth/refresh',
  '/api/payments/webhook',
  '/api/caterers',
  '/api/caterers/cities',
]);

function isPublicRoute(method: string, url: string): boolean {
  const path = url.split('?')[0];

  // Exactly matches one of the public endpoints
  if (PUBLIC_EXACT_ROUTES.has(path)) {
    // If it's a caterer search/listing, only GET is public
    if (path === '/api/caterers' || path === '/api/caterers/cities') {
      return method === 'GET';
    }
    return true;
  }

  // Public caterer detail view: GET /api/caterers/:id and GET /api/caterers/:id/items
  if (method === 'GET' && /^\/api\/caterers\/[0-9a-fA-F-]+(\/items)?$/.test(path)) {
    return true;
  }

  return false;
}

export function buildGatewayServer() {
  const env = validateEnv(createGatewayEnvSchema(), process.env);
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    trustProxy: true,
    bodyLimit: 15728640, // 15MB payload limit for dish photos and media
    connectionTimeout: 10000, // 10s
    requestTimeout: 15000, // 15s
  });

  registerCentralizedErrorHandler(server, 'api-gateway');

  server.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  server.register(fastifyRateLimit, {
    global: true,
    allowList: ['127.0.0.1', '::1'],
    max: (req) => {
      // Stricter rate limit on sensitive authentication endpoints
      if (req.url?.startsWith('/api/auth/login') || req.url?.startsWith('/api/auth/register')) {
        return 10;
      }
      if (isTest) return 10000;
      return 100;
    },
    timeWindow: '1 minute',
    errorResponseBuilder: (req, context) => {
      const retryAfterSeconds = Math.max(1, Math.ceil(context.ttl / 1000));
      const isAuth = req.url?.startsWith('/api/auth/login') || req.url?.startsWith('/api/auth/register');
      const cause = isAuth
        ? `Too many sign-in / registration attempts from your IP (maximum ${context.max} requests per minute allowed for security).`
        : `Too many API requests sent in a short period (maximum ${context.max} requests per minute allowed).`;
      const message = `${cause} Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'} before trying again.`;

      return {
        statusCode: 429,
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        cause,
        retryAfter: retryAfterSeconds,
        message,
      };
    },
  });

  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));

  server.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  // Application-layer HTTPS redirect enforcement (P1-19) & Strip client-sent x-user-* and internal security headers on EVERY incoming request
  server.addHook('onRequest', async (req, reply) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const isHttp = typeof rawProto === 'string' && rawProto.split(',')[0].trim().toLowerCase() === 'http';
    if (isHttp) {
      const host = req.headers.host || req.hostname;
      return reply.redirect(`https://${host}${req.raw.url}`, 301);
    }
    delete req.headers['x-user-id'];
    delete req.headers['x-user-role'];
    delete req.headers['x-internal-token'];
  });

  // Health & Readiness checks
  server.get('/health', async (req) => ({
    status: 'ok',
    gateway: 'caterconnect-api-gateway',
    timestamp: new Date().toISOString(),
    hasSpoofedHeaders: Boolean(req.headers['x-user-id'] || req.headers['x-user-role'] || req.headers['x-internal-token']),
  }));

  server.get('/ready', async () => ({
    status: 'ready',
    gateway: 'caterconnect-api-gateway',
    timestamp: new Date().toISOString(),
  }));

  // Internal token cache (30s TTL) to eliminate repeated synchronous HMAC re-signing per proxy hop
  const internalTokenCache = new Map<string, { token: string; expiresAt: number }>();

  function getCachedInternalToken(payload: { userId: string; role: any; email?: string }, secret: string): string {
    const now = Date.now();
    const cacheKey = `${payload.userId}:${payload.role}:${payload.email || ''}`;
    const cached = internalTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.token;
    }
    const token = signInternalToken(payload, secret);
    internalTokenCache.set(cacheKey, { token, expiresAt: now + 30000 });
    if (internalTokenCache.size > 2000) {
      for (const [k, v] of internalTokenCache.entries()) {
        if (v.expiresAt <= now) internalTokenCache.delete(k);
      }
    }
    return token;
  }

  // Generic JWT authentication hook that signs internal token for downstream services
  const requireAuth = async (req: any, reply: any) => {
    if (isPublicRoute(req.method, req.url)) {
      if (req.headers.authorization) {
        try {
          await req.jwtVerify();
          const user = req.user as { sub: string; role: any; email?: string };
          req.headers['x-user-id'] = user.sub;
          req.headers['x-user-role'] = user.role;
          req.headers['x-internal-token'] = getCachedInternalToken(
            { userId: user.sub, role: user.role, email: user.email },
            env.JWT_SECRET
          );
        } catch {
          // Token verification failed on public route; continue without auth headers
        }
      }
      return;
    }

    try {
      await req.jwtVerify();
      const user = req.user as { sub: string; role: any; email?: string };
      req.headers['x-user-id'] = user.sub;
      req.headers['x-user-role'] = user.role;
      req.headers['x-internal-token'] = getCachedInternalToken(
        { userId: user.sub, role: user.role, email: user.email },
        env.JWT_SECRET
      );
    } catch (err: any) {
      const isExpired =
        err?.code === 'FAST_JWT_EXPIRED' ||
        err?.name === 'TokenExpiredError' ||
        (err?.message && err.message.toLowerCase().includes('expired'));

      if (isExpired) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          code: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please sign in again to continue.',
        });
      }

      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: Authentication required',
      });
    }
  };

  // Admin Verification Guard
  const adminAuthPreHandler = async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
      const user = req.user as { sub: string; role: string; email?: string };
      if (user.role !== 'admin') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          code: 'FORBIDDEN',
          message: 'Forbidden: Admin access required',
        });
      }
      req.headers['x-user-id'] = user.sub;
      req.headers['x-user-role'] = user.role;
      req.headers['x-internal-token'] = getCachedInternalToken(
        { userId: user.sub, role: 'admin', email: user.email },
        env.JWT_SECRET
      );
    } catch (err: any) {
      const isExpired =
        err?.code === 'FAST_JWT_EXPIRED' ||
        err?.name === 'TokenExpiredError' ||
        (err?.message && err.message.toLowerCase().includes('expired'));

      if (isExpired) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          code: 'SESSION_EXPIRED',
          message: 'Your administrator session has expired. Please sign in again.',
        });
      }

      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: Authentication required',
      });
    }
  };

  // Service URLs
  const AUTH_URL = env.AUTH_SERVICE_URL;
  const CATERER_URL = env.CATERER_SERVICE_URL;
  const BOOKING_URL = env.BOOKING_SERVICE_URL;
  const PAYMENT_URL = env.PAYMENT_SERVICE_URL;
  const NOTIFY_URL = env.NOTIFICATION_SERVICE_URL;
  const CHAT_URL = env.CHAT_SERVICE_URL;

  // Undici keep-alive connection pool options to eliminate TCP socket handshake latency per proxy hop
  const proxyUndiciOptions = {
    connections: 50,
    pipelining: 1,
    keepAliveTimeout: 60000,
    keepAliveMaxTimeout: 600000,
  };

  // 1. Auth Service Routes
  server.register(fastifyHttpProxy, {
    upstream: AUTH_URL,
    prefix: '/api/auth',
    rewritePrefix: '/api/auth',
    undici: proxyUndiciOptions,
  });

  // 2. Caterer & Menu Service Routes
  server.register(fastifyHttpProxy, {
    upstream: CATERER_URL,
    prefix: '/api/caterers',
    rewritePrefix: '/api/caterers',
    undici: proxyUndiciOptions,
    preHandler: async (req, reply) => {
      // Allow GET public routes (with optional auth forwarding); require authentication for mutations and protected reads
      return requireAuth(req, reply);
    },
  });

  // 3a. Booking Invoices -> Payment Service (P1-6: Statutory GST Invoicing & TDS/TCS Ledger)
  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/bookings/:id/invoice',
    rewritePrefix: '/api/bookings/:id/invoice',
    undici: proxyUndiciOptions,
    preHandler: requireAuth,
  });

  // 3b. Booking & Order Service General Routes
  server.register(fastifyHttpProxy, {
    upstream: BOOKING_URL,
    prefix: '/api/bookings',
    rewritePrefix: '/api/bookings',
    undici: proxyUndiciOptions,
    preHandler: requireAuth,
  });

  // 4. Payment Service Routes
  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/payments',
    rewritePrefix: '/api/payments',
    undici: proxyUndiciOptions,
    preHandler: async (req, reply) => {
      const path = req.url.split('?')[0];
      // Only the EXACT webhook path is public
      if (path === '/api/payments/webhook' && req.method === 'POST') {
        return;
      }
      if (path.startsWith('/api/payments/internal')) {
        await requireAuth(req, reply);
        if (reply.sent) return;
        const user = req.user as { sub: string; role: any; email?: string } | undefined;
        if (!user || user.role !== 'admin') {
          return reply.status(403).send({ error: 'Forbidden: Admin access required for internal payment operations' });
        }
        return;
      }
      return requireAuth(req, reply);
    },
  });

  // 5a. Real-Time Events WebSocket Proxy (Notification Service)
  server.register(fastifyHttpProxy, {
    upstream: NOTIFY_URL,
    prefix: '/api/events',
    rewritePrefix: '/api/events',
    websocket: true,
    wsClientOptions: {
      rewriteRequestHeaders: (headers: any, req: any) => {
        const res = { ...headers };
        if (req.headers && req.headers.authorization) {
          res.authorization = req.headers.authorization;
        } else {
          delete res.authorization;
        }
        for (const key of Object.keys(res)) {
          if (res[key] === undefined) {
            delete res[key];
          }
        }
        return res;
      },
    } as any,
  });

  // 5b. Notification Service Routes (Protected + WebSocket enabled)
  server.register(fastifyHttpProxy, {
    upstream: NOTIFY_URL,
    prefix: '/api/notify',
    rewritePrefix: '/api/notify',
    websocket: true,
    wsClientOptions: {
      rewriteRequestHeaders: (headers: any, req: any) => {
        const res = { ...headers };
        if (req.headers && req.headers.authorization) {
          res.authorization = req.headers.authorization;
        } else {
          delete res.authorization;
        }
        for (const key of Object.keys(res)) {
          if (res[key] === undefined) {
            delete res[key];
          }
        }
        return res;
      },
    } as any,
    preHandler: async (req, reply) => {
      // Allow WebSocket handshake carrying token query param or authorization header
      if (req.raw.headers.upgrade === 'websocket' || req.url.includes('/ws')) {
        return;
      }
      return requireAuth(req, reply);
    },
  });

  // 6. Chat & Messaging Routes
  server.register(fastifyHttpProxy, {
    upstream: CHAT_URL,
    prefix: '/api/chat',
    rewritePrefix: '/api/chat',
    undici: proxyUndiciOptions,
    preHandler: requireAuth,
  });

  // 7. Admin Service Routes
  server.register(fastifyHttpProxy, {
    upstream: CATERER_URL,
    prefix: '/api/admin/caterers',
    rewritePrefix: '/api/admin/caterers',
    undici: proxyUndiciOptions,
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: BOOKING_URL,
    prefix: '/api/admin/bookings',
    rewritePrefix: '/api/admin/bookings',
    undici: proxyUndiciOptions,
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/admin/settlements',
    rewritePrefix: '/api/admin/settlements',
    undici: proxyUndiciOptions,
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/admin/analytics',
    rewritePrefix: '/api/admin/analytics',
    undici: proxyUndiciOptions,
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/admin/reconciliation',
    rewritePrefix: '/api/admin/reconciliation',
    undici: proxyUndiciOptions,
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: BOOKING_URL,
    prefix: '/api/admin/disputes',
    rewritePrefix: '/api/admin/disputes',
    undici: proxyUndiciOptions,
    preHandler: adminAuthPreHandler,
  });

  // 8. System Ops & Node Monitoring Endpoints
  registerOpsRoutes(server, adminAuthPreHandler);

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildGatewayServer();
  const PORT = parseInt(process.env.PORT || '8080', 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`CaterConnect API Gateway listening at ${address}`);
  });
}
