import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
import { findUserByEmail, findUserById, createUser, createGoogleUser, linkGoogleIdToUser, updateUserPhone } from './users';
import { z } from 'zod';
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

  // Helper to persist cryptographically secure refresh token in family (P0-24)
  async function createRefreshToken(userId: string, familyId?: string): Promise<string> {
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    if (familyId) {
      await pgPool.query(
        `INSERT INTO auth_svc.refresh_tokens (user_id, token_hash, family_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, tokenHash, familyId, expiresAt]
      );
    } else {
      await pgPool.query(
        `INSERT INTO auth_svc.refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
      );
    }

    return rawRefreshToken;
  }

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
    const token = server.jwt.sign(
      { sub: newUser.id, role: newUser.role, email },
      { expiresIn: '15m' }
    );
    const refreshToken = await createRefreshToken(newUser.id);

    return reply.status(201).send({
      user: newUser,
      token,
      refreshToken,
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

      const token = server.jwt.sign(
        { sub: user.id, role: user.role, email: user.email },
        { expiresIn: '15m' }
      );
      const refreshToken = await createRefreshToken(user.id);

      return reply.send({
        user: {
          id: user.id,
          role: user.role,
          fullName: user.full_name,
          phone: user.phone,
          createdAt: user.created_at,
        },
        token,
        refreshToken,
      });
    } catch (err: any) {
      console.error('LOGIN ERROR DETAILS:', err);
      return reply.status(500).send({ error: err.message || 'Internal Server Error' });
    }
  });

  // Refresh Token Rotation with Token Family Reuse Detection (P0-24)
  server.post('/api/auth/refresh', async (req, reply) => {
    try {
      const { refreshToken } = (req.body as any) || {};
      if (!refreshToken || typeof refreshToken !== 'string') {
        return reply.status(400).send({ error: 'refreshToken is required' });
      }

      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const tokenRes = await pgPool.query(
        'SELECT id, user_id, family_id, is_revoked, expires_at FROM auth_svc.refresh_tokens WHERE token_hash = $1',
        [tokenHash]
      );

      if (tokenRes.rows.length === 0) {
        return reply.status(401).send({ error: 'Invalid refresh token' });
      }

      const record = tokenRes.rows[0];

      // Reuse detection: If a revoked token is used, someone may have stolen it!
      // Invalidate the ENTIRE token family immediately.
      if (record.is_revoked) {
        await pgPool.query(
          'UPDATE auth_svc.refresh_tokens SET is_revoked = true WHERE family_id = $1',
          [record.family_id]
        );
        return reply.status(401).send({
          error: 'Refresh token reuse detected. All sessions in this family have been revoked.',
        });
      }

      if (new Date() > new Date(record.expires_at)) {
        return reply.status(401).send({ error: 'Refresh token has expired. Please log in again.' });
      }

      const userRes = await pgPool.query(
        'SELECT id, role, email, full_name, phone, created_at FROM auth_svc.users WHERE id = $1',
        [record.user_id]
      );
      if (userRes.rows.length === 0) {
        return reply.status(401).send({ error: 'User no longer exists' });
      }

      const user = userRes.rows[0];

      // Rotate: Revoke old token and issue new token in the same family
      await pgPool.query(
        'UPDATE auth_svc.refresh_tokens SET is_revoked = true WHERE id = $1',
        [record.id]
      );

      const newAccessToken = server.jwt.sign(
        { sub: user.id, role: user.role, email: user.email },
        { expiresIn: '15m' }
      );
      const newRefreshToken = await createRefreshToken(user.id, record.family_id);

      return reply.send({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          role: user.role,
          fullName: user.full_name,
          email: user.email,
        },
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to refresh token' });
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
          message: 'Your session has expired. Please sign in again.',
        });
      }

      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing authentication token.',
      });
    }
  });

  // Update Customer Phone Number (Required for booking & notifications)
  server.post('/api/auth/update-phone', async (req, reply) => {
    try {
      await req.jwtVerify();
      const payload = req.user as { sub: string; role: string };
      
      const phoneSchema = z.object({
        phone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Must be a valid Indian mobile number (+91 followed by 10 digits)'),
      });

      const parse = phoneSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({
          error: parse.error.issues[0]?.message || 'Invalid phone format',
        });
      }

      const updated = await updateUserPhone(payload.sub, parse.data.phone);
      if (!updated) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({
        success: true,
        user: updated,
      });
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

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
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
