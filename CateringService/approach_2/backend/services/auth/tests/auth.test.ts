import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildAuthServer } from '../src';
import { pgPool } from '../src/db';

describe('Auth Service Fastify Integration', () => {
  const app = buildAuthServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('responds with 200 on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'auth-service' });
  });

  it('rejects registration with invalid phone format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'invalid@example.com',
        password: 'Password123!',
        fullName: 'Test User',
        phone: '12345', // invalid +91
        role: 'customer',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('logs in an existing user and returns signed JWT with correct role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'customer@example.com',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email || body.user.fullName).toBeDefined();
    expect(body.user.role).toBe('customer');
    expect(body.token).toBeDefined();
  });
});
