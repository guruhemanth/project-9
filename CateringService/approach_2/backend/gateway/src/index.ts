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

// Public endpoints that do NOT require a JWT token (exact path / pattern match)
const PUBLIC_EXACT_ROUTES = new Set([
  '/health',
  '/ready',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/google',
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
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576, // 1MB payload limit
    connectionTimeout: 10000, // 10s
    requestTimeout: 15000, // 15s
  });

  registerCentralizedErrorHandler(server, 'api-gateway');

  server.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  server.register(fastifyRateLimit, {
    global: true,
    max: (req) => {
      // Stricter rate limit on sensitive authentication endpoints
      if (req.url?.startsWith('/api/auth/login') || req.url?.startsWith('/api/auth/register')) {
        return 10;
      }
      return 100;
    },
    timeWindow: '1 minute',
  });

  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));

  server.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  // Strip client-sent x-user-* and internal security headers on EVERY incoming request
  server.addHook('onRequest', async (req) => {
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

  // Generic JWT authentication hook that signs internal token for downstream services
  const requireAuth = async (req: any, reply: any) => {
    if (isPublicRoute(req.method, req.url)) {
      return;
    }

    try {
      await req.jwtVerify();
      const user = req.user as { sub: string; role: any; email?: string };
      req.headers['x-user-id'] = user.sub;
      req.headers['x-user-role'] = user.role;
      req.headers['x-internal-token'] = signInternalToken(
        { userId: user.sub, role: user.role, email: user.email },
        env.JWT_SECRET
      );
    } catch {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }
  };

  // Admin Verification Guard
  const adminAuthPreHandler = async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
      const user = req.user as { sub: string; role: string; email?: string };
      if (user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }
      req.headers['x-user-id'] = user.sub;
      req.headers['x-user-role'] = user.role;
      req.headers['x-internal-token'] = signInternalToken(
        { userId: user.sub, role: 'admin', email: user.email },
        env.JWT_SECRET
      );
    } catch {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }
  };

  // Service URLs
  const AUTH_URL = env.AUTH_SERVICE_URL;
  const CATERER_URL = env.CATERER_SERVICE_URL;
  const BOOKING_URL = env.BOOKING_SERVICE_URL;
  const PAYMENT_URL = env.PAYMENT_SERVICE_URL;
  const NOTIFY_URL = env.NOTIFICATION_SERVICE_URL;
  const CHAT_URL = env.CHAT_SERVICE_URL;

  // 1. Auth Service Routes
  server.register(fastifyHttpProxy, {
    upstream: AUTH_URL,
    prefix: '/api/auth',
    rewritePrefix: '/api/auth',
  });

  // 2. Caterer & Menu Service Routes
  server.register(fastifyHttpProxy, {
    upstream: CATERER_URL,
    prefix: '/api/caterers',
    rewritePrefix: '/api/caterers',
    preHandler: async (req, reply) => {
      // Allow GET public routes; require authentication for mutations and protected reads
      if (isPublicRoute(req.method, req.url)) {
        return;
      }
      return requireAuth(req, reply);
    },
  });

  // 3. Booking & Order Service Routes
  server.register(fastifyHttpProxy, {
    upstream: BOOKING_URL,
    prefix: '/api/bookings',
    rewritePrefix: '/api/bookings',
    preHandler: requireAuth,
  });

  // 4. Payment Service Routes
  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/payments',
    rewritePrefix: '/api/payments',
    preHandler: async (req, reply) => {
      const path = req.url.split('?')[0];
      // Only the EXACT webhook path is public
      if (path === '/api/payments/webhook' && req.method === 'POST') {
        return;
      }
      return requireAuth(req, reply);
    },
  });

  // 5. Notification Service Routes (Protected)
  server.register(fastifyHttpProxy, {
    upstream: NOTIFY_URL,
    prefix: '/api/notify',
    rewritePrefix: '/api/notify',
    preHandler: requireAuth,
  });

  // 6. Chat & Messaging Routes
  server.register(fastifyHttpProxy, {
    upstream: CHAT_URL,
    prefix: '/api/chat',
    rewritePrefix: '/api/chat',
    preHandler: requireAuth,
  });

  // 7. Admin Service Routes
  server.register(fastifyHttpProxy, {
    upstream: CATERER_URL,
    prefix: '/api/admin/caterers',
    rewritePrefix: '/api/admin/caterers',
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: BOOKING_URL,
    prefix: '/api/admin/bookings',
    rewritePrefix: '/api/admin/bookings',
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/admin/settlements',
    rewritePrefix: '/api/admin/settlements',
    preHandler: adminAuthPreHandler,
  });

  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/admin/analytics',
    rewritePrefix: '/api/admin/analytics',
    preHandler: adminAuthPreHandler,
  });

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
