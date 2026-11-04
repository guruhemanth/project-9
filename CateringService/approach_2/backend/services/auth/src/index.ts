import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import {
  registerSchema,
  loginSchema,
  validateEnv,
  createAuthEnvSchema,
  buildCorsOptions,
  registerCentralizedErrorHandler,
  loggerRedactionConfig,
} from '@caterconnect/shared';
import { pgPool } from './db';
import { findUserByEmail, findUserById, createUser, createGoogleUser, linkGoogleIdToUser } from './users';
import { verifyGoogleIdToken } from './google';

export function buildAuthServer() {
  const env = validateEnv(createAuthEnvSchema(), process.env);
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576,
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });

  registerCentralizedErrorHandler(server, 'auth-service');

  server.addHook('onClose', async () => {
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  server.register(fastifyHelmet, { contentSecurityPolicy: false });
  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));
  server.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  // Health & Readiness checks
  server.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));
  server.get('/ready', async (_req, reply) => {
    try {
      await pgPool.query('SELECT 1');
      return { status: 'ready', database: 'connected', service: 'auth-service' };
    } catch (err: any) {
      return reply.status(503).send({ status: 'not_ready', database: 'disconnected', service: 'auth-service' });
    }
  });

  // Register
  server.post('/api/auth/register', async (req, reply) => {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password, fullName, phone, role } = parseResult.data;

    const existing = await findUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const newUser = await createUser({ email, password, fullName, phone, role });
    const token = server.jwt.sign({
      sub: newUser.id,
      role: newUser.role,
      email,
    });

    return reply.status(201).send({
      user: newUser,
      token,
    });
  });

  // Login
  server.post('/api/auth/login', async (req, reply) => {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid credentials format' });
      }

      const { email, password } = parseResult.data;
      const user = await findUserByEmail(email);
      if (!user) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const validPassword = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
      if (!validPassword) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const token = server.jwt.sign({
        sub: user.id,
        role: user.role,
        email: user.email,
      });

      return reply.send({
        user: {
          id: user.id,
          role: user.role,
          fullName: user.full_name,
          phone: user.phone,
          createdAt: user.created_at,
        },
        token,
      });
    } catch (err: any) {
      console.error('LOGIN ERROR DETAILS:', err);
      return reply.status(500).send({ error: err.message || 'Internal Server Error' });
    }
  });

  // Google OAuth Sign-in (Customers Only)
  server.post('/api/auth/google', async (req, reply) => {
    try {
      const { idToken } = (req.body as any) || {};
      if (!idToken || typeof idToken !== 'string') {
        return reply.status(400).send({ error: 'idToken is required' });
      }

      const isTesting = env.NODE_ENV === 'test';
      let googleUser;
      try {
        googleUser = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, isTesting);
      } catch (verifyErr: any) {
        req.log.warn({ err: verifyErr.message }, 'Google ID token verification failed');
        return reply.status(401).send({ error: 'Invalid Google authentication token' });
      }

      const existingUser = await findUserByEmail(googleUser.email);

      if (existingUser) {
        // Enforce: Customers only! Reject caterers and admins.
        if (existingUser.role !== 'customer') {
          return reply.status(403).send({
            error: 'Google sign-in is restricted to customer accounts. Caterers and administrators must sign in with their registered email and password credentials.',
          });
        }

        // Link google_id if not linked
        await linkGoogleIdToUser(existingUser.id, googleUser.sub);

        const token = server.jwt.sign(
          { sub: existingUser.id, role: existingUser.role, email: existingUser.email },
          { expiresIn: '7d' }
        );
        const refreshToken = server.jwt.sign(
          { sub: existingUser.id, type: 'refresh' },
          { expiresIn: '30d' }
        );

        return reply.send({
          user: {
            id: existingUser.id,
            email: existingUser.email,
            role: existingUser.role,
            fullName: existingUser.full_name,
            phone: existingUser.phone,
            createdAt: existingUser.created_at,
          },
          token,
          refreshToken,
        });
      }

      // User does not exist -> provision new customer account
      const newUser = await createGoogleUser({
        email: googleUser.email,
        fullName: googleUser.name || 'Google Customer',
        googleId: googleUser.sub,
      });

      const token = server.jwt.sign(
        { sub: newUser.id, role: newUser.role, email: googleUser.email },
        { expiresIn: '7d' }
      );
      const refreshToken = server.jwt.sign(
        { sub: newUser.id, type: 'refresh' },
        { expiresIn: '30d' }
      );

      return reply.send({
        user: {
          id: newUser.id,
          email: googleUser.email,
          role: newUser.role,
          fullName: newUser.fullName,
          phone: newUser.phone,
          createdAt: newUser.createdAt,
        },
        token,
        refreshToken,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to process Google authentication' });
    }
  });

  // Me / Profile
  server.get('/api/auth/me', async (req, reply) => {
    try {
      await req.jwtVerify();
      const payload = req.user as { sub: string; role: string };
      const user = await findUserById(payload.sub);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      return reply.send({ user });
    } catch {
      return reply.status(401).send({ error: 'Unauthorized token' });
    }
  });

  // Internal Verify Token for Gateway
  server.post('/api/auth/verify', async (req, reply) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ valid: false });
      }
      const token = authHeader.replace('Bearer ', '');
      const decoded = server.jwt.verify<{ sub: string; role: string; email: string }>(token);
      return reply.send({ valid: true, user: decoded });
    } catch {
      return reply.status(401).send({ valid: false });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const server = buildAuthServer();
  const PORT = Number(process.env.PORT) || 4001;
  server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Auth Service listening on ${address}`);
  });
}
