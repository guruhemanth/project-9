import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHttpProxy from '@fastify/http-proxy';
import fastifyJwt from '@fastify/jwt';

export function buildGatewayServer() {
  const server = Fastify({ logger: false });

  server.register(fastifyCors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  server.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long',
  });

  // Health check
  server.get('/health', async () => ({
    status: 'ok',
    gateway: 'caterconnect-api-gateway',
    timestamp: new Date().toISOString(),
  }));

  // Service URLs
  const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:4001';
  const CATERER_URL = process.env.CATERER_SERVICE_URL || 'http://127.0.0.1:4002';
  const BOOKING_URL = process.env.BOOKING_SERVICE_URL || 'http://127.0.0.1:4003';
  const PAYMENT_URL = process.env.PAYMENT_SERVICE_URL || 'http://127.0.0.1:4004';
  const NOTIFY_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://127.0.0.1:4005';
  const CHAT_URL = process.env.CHAT_SERVICE_URL || 'http://127.0.0.1:4006';

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
