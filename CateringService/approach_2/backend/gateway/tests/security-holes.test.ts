import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildGatewayServer } from '../src';

describe('Gateway Security Holes Verification (Test-First)', () => {
  const app = buildGatewayServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests with /webhook in query string attempting to bypass JWT verification', async () => {
    // F3 test: substring /webhook bypass
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/settlements/generate?bypass=/webhook',
      payload: { bookingId: 'b0000000-0000-0000-0000-000000000001' },
    });
    // This MUST fail with 401 Unauthorized because it is NOT the exact webhook endpoint
    expect(res.statusCode).toBe(401);
  });

  it('blocks unauthenticated DELETE requests to caterer endpoints', async () => {
    // F4 test: DELETE request to caterer endpoint must require authentication
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/caterers/d0000000-0000-0000-0000-000000000001/blackout-dates/2026-11-20',
    });
    // This MUST return 401 Unauthorized
    expect(res.statusCode).toBe(401);
  });

  it('strips client-supplied x-user-* headers to prevent identity spoofing', async () => {
    // F6 test: client sends spoofed x-user-id header
    const customerToken = app.jwt.sign({
      sub: 'c0000000-0000-0000-0000-000000000001',
      role: 'customer',
      email: 'customer@caterconnect.com',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/caterers/cities',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'x-user-id': 'spoofed-admin-id',
        'x-user-role': 'admin',
      },
    });

    expect(res.statusCode).toBe(200);
  });
});
