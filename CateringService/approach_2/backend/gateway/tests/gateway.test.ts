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

  it('responds with 200 on /ready', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('status', 'ready');
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

  it('blocks unauthenticated customer from creating a booking request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        catererId: 'd0000000-0000-0000-0000-000000000001',
        packageId: 'e0000000-0000-0000-0000-000000000001',
        eventDate: '2026-11-20',
        eventTime: '12:30:00',
        guestCount: 50,
        venueAddress: 'Test Hall',
        city: 'Tirupati',
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('Unauthorized');
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

  it('rejects requests from disallowed Origin headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: 'https://evil-unauthorized-phishing-domain.com',
      },
    });
    // Disallowed origin returns 500 error from CORS pre-validation
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain('not allowed by CaterConnect CORS policy');
  });

  it('allows requests from valid allowed origins', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('sets security headers via fastify-helmet', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
});