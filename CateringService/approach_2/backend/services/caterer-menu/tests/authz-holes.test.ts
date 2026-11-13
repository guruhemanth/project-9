import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildCatererServer } from '../src';
import { pgPool } from '../src/db';

describe('Caterer Menu Service Authorization Holes (Test-First)', () => {
  const app = buildCatererServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
    await app.close();
  });

  it('FAIL: non-admin cannot update caterer verification status', async () => {
    // F2: PATCH /api/caterers/:id/status by non-admin must fail with 403
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/caterers/d0000000-0000-0000-0000-000000000001/status',
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001',
        'x-user-role': 'customer',
      },
      payload: { status: 'approved' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('FAIL: non-owner caterer cannot add package to another caterers profile', async () => {
    // F4: POST /api/caterers/:id/packages by caterer B for caterer A must fail with 403
    const res = await app.inject({
      method: 'POST',
      url: '/api/caterers/d0000000-0000-0000-0000-000000000001/packages',
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000009', // Different caterer owner
        'x-user-role': 'caterer',
      },
      payload: {
        name: 'Malicious Package',
        pricePerPlatePaise: 50000,
        minGuests: 50,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('FAIL: non-owner caterer cannot set blackout date for another caterer', async () => {
    // F4: POST /api/caterers/:id/blackout-dates by non-owner must fail with 403
    const res = await app.inject({
      method: 'POST',
      url: '/api/caterers/d0000000-0000-0000-0000-000000000001/blackout-dates',
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000009', // Different caterer owner
        'x-user-role': 'caterer',
      },
      payload: {
        date: '2026-12-25',
        reason: 'Hijacked Blackout',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
