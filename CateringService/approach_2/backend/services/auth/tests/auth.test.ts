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
    expect(body.refreshToken).toBeDefined();
  });

  it('P0-24: rotates refresh token and detects reuse', async () => {
    // 1. Login to obtain access token & refresh token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'customer@example.com',
        password: 'Password123!',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const initialRefresh = loginRes.json().refreshToken;
    expect(initialRefresh).toBeTruthy();

    // 2. Call /api/auth/refresh with valid refresh token -> returns new access token & new refresh token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: initialRefresh },
    });
    expect(refreshRes.statusCode).toBe(200);
    const newTokens = refreshRes.json();
    expect(newTokens.token).toBeTruthy();
    expect(newTokens.refreshToken).toBeTruthy();
    expect(newTokens.refreshToken).not.toBe(initialRefresh);

    // 3. Attempt to reuse old initial refresh token -> triggers reuse detection & revokes family
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: initialRefresh },
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json().error).toContain('reuse detected');

    // 4. Any subsequent use of the rotated token is also rejected because family was revoked
    const postReuseRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: newTokens.refreshToken },
    });
    expect(postReuseRes.statusCode).toBe(401);
  });
});
