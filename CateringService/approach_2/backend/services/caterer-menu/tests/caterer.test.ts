import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildCatererServer } from '../src';
import { pgPool } from '../src/db';

describe('Caterer & Menu Service Integration', () => {
  const app = buildCatererServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pgPool.end();
  });

  it('responds with 200 on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'caterer-menu-service' });
  });

  it('lists approved caterers in Tirupati', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/caterers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.caterers).toBeDefined();
    expect(Array.isArray(body.caterers)).toBe(true);
    expect(body.caterers.length).toBeGreaterThanOrEqual(1);
    expect(body.caterers[0].status).toBe('approved');
    expect(body.caterers[0].city).toBe('Tirupati');
  });

  it('retrieves detailed caterer profile with packages and items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/caterers/d0000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.caterer.businessName).toBe('Sri Venkateswara Catering Services');
    expect(body.caterer.packages.length).toBeGreaterThanOrEqual(1);
    expect(body.caterer.packages[0].items.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects caterer onboarding with invalid FSSAI number', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/caterers/onboard',
      payload: {
        businessName: 'Fake Catering',
        fssaiNumber: '123', // Invalid: must be 14 digits
        cuisines: ['south_indian'],
      },
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000002',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('ValidationError');
  });

  it('allows caterer to declare a blackout date and query availability', async () => {
    const catererId = 'd0000000-0000-0000-0000-000000000001';
    const blackoutDate = '2026-12-31';

    // 1. Add blackout date
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/caterers/${catererId}/blackout-dates`,
      payload: {
        date: blackoutDate,
        reason: 'New Year Eve Private Event',
      },
    });
    expect(postRes.statusCode).toBe(201);
    expect(postRes.json().blackoutDate.unavailableDate).toBe(blackoutDate);

    // 2. Query availability
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/caterers/${catererId}/availability?month=2026-12`,
    });
    expect(getRes.statusCode).toBe(200);
    const dates = getRes.json().unavailableDates;
    expect(dates.some((d: any) => d.unavailableDate === blackoutDate)).toBe(true);

    // 3. Remove blackout date
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/caterers/${catererId}/blackout-dates/${blackoutDate}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);
  });

  it('allows admin to list all caterers and update caterer status', async () => {
    // 1. List all caterers
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/caterers',
    });
    expect(listRes.statusCode).toBe(200);
    const caterers = listRes.json().caterers;
    expect(Array.isArray(caterers)).toBe(true);
    expect(caterers.length).toBeGreaterThanOrEqual(1);

    // 2. Reject caterer without reason -> 400
    const failRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/caterers/${caterers[0].id}/status`,
      payload: { status: 'rejected' },
    });
    expect(failRes.statusCode).toBe(400);

    // 3. Update caterer status to approved
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/caterers/${caterers[0].id}/status`,
      payload: { status: 'approved' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().caterer.status).toBe('approved');
  });
});