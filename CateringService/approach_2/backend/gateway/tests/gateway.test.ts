import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildGatewayServer } from '../src';

describe('API Gateway Integration', () => {
  const app = buildGatewayServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds with 200 on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('gateway', 'caterconnect-api-gateway');
  });

  it('blocks unauthenticated mutation requests to /api/caterers/onboard', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/caterers/onboard',
      payload: { businessName: 'Test' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('Unauthorized');
  });

  it('blocks unauthenticated requests to /api/bookings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bookings/customer',
    });
    expect(res.statusCode).toBe(401);
  });

  it('blocks unauthenticated or non-admin requests to /api/admin/analytics', async () => {
    // 1. Unauthenticated -> 401
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics',
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Authenticated as non-admin customer -> 403
    const customerToken = app.jwt.sign({
      sub: 'c0000000-0000-0000-0000-000000000001',
      role: 'customer',
      email: 'customer@caterconnect.com',
    });

    const forbiddenRes = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics',
      headers: {
        authorization: `Bearer ${customerToken}`,
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);
    expect(forbiddenRes.json().error).toContain('Forbidden');
  });
});