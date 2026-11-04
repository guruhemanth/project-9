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
} from '@caterconnect/shared';

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

  // Health & Readiness checks
  server.get('/health', async () => ({
    status: 'ok',
    gateway: 'caterconnect-api-gateway',
    timestamp: new Date().toISOString(),
  }));

  server.get('/ready', async () => ({
    status: 'ready',
    gateway: 'caterconnect-api-gateway',
    timestamp: new Date().toISOString(),
  }));

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
      // If mutation (onboarding / status update / adding package), verify JWT
      if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
        try {
          await req.jwtVerify();
          const user = req.user as { sub: string; role: string; email: string };
          req.headers['x-user-id'] = user.sub;
          req.headers['x-user-role'] = user.role;
        } catch {
          return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
        }
      }
    },
  });

  // 3. Booking & Order Service Routes
  server.register(fastifyHttpProxy, {
    upstream: BOOKING_URL,
    prefix: '/api/bookings',
    rewritePrefix: '/api/bookings',
    preHandler: async (req, reply) => {
      try {
        await req.jwtVerify();
        const user = req.user as { sub: string; role: string; email: string };
        req.headers['x-user-id'] = user.sub;
        req.headers['x-user-role'] = user.role;
      } catch {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }
    },
  });

  // 4. Payment Service Routes
  server.register(fastifyHttpProxy, {
    upstream: PAYMENT_URL,
    prefix: '/api/payments',
    rewritePrefix: '/api/payments',
    preHandler: async (req, reply) => {
      // Webhooks are signed by Razorpay HMAC, don't require user JWT
      if (req.url.includes('/webhook')) {
        return;
      }
      try {
        await req.jwtVerify();
        const user = req.user as { sub: string; role: string; email: string };
        req.headers['x-user-id'] = user.sub;
        req.headers['x-user-role'] = user.role;
      } catch {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }
    },
  });

  // 5. Notification Service Routes
  server.register(fastifyHttpProxy, {
    upstream: NOTIFY_URL,
    prefix: '/api/notify',
    rewritePrefix: '/api/notify',
  });

  // 6. Chat & Messaging Routes
  server.register(fastifyHttpProxy, {
    upstream: CHAT_URL,
    prefix: '/api/chat',
    rewritePrefix: '/api/chat',
    preHandler: async (req, reply) => {
      try {
        await req.jwtVerify();
        const user = req.user as { sub: string; role: string; email: string };
        req.headers['x-user-id'] = user.sub;
        req.headers['x-user-role'] = user.role;
      } catch {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required for chat' });
      }
    },
  });

  // Admin Verification Guard
  const adminAuthPreHandler = async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
      const user = req.user as { sub: string; role: string; email: string };
      if (user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }
      req.headers['x-user-id'] = user.sub;
      req.headers['x-user-role'] = user.role;
    } catch {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }
  };

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
