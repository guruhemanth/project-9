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
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('responds with 200 on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'caterer-menu-service' });
  });

  it('lists approved caterers with city and regional location filtering', async () => {
    // 1. All India query
    const resAll = await app.inject({ method: 'GET', url: '/api/caterers' });
    expect(resAll.statusCode).toBe(200);
    const bodyAll = resAll.json();
    expect(bodyAll.caterers).toBeDefined();
    expect(bodyAll.caterers.length).toBeGreaterThanOrEqual(1);

    // 2. Tirupati filter
    const resTirupati = await app.inject({ method: 'GET', url: '/api/caterers?city=Tirupati' });
    expect(resTirupati.statusCode).toBe(200);
    const bodyTirupati = resTirupati.json();
    expect(bodyTirupati.caterers.length).toBeGreaterThanOrEqual(1);
    expect(bodyTirupati.caterers.every((c: any) => c.city === 'Tirupati')).toBe(true);

    // 3. Active cities list
    const resCities = await app.inject({ method: 'GET', url: '/api/caterers/cities' });
    expect(resCities.statusCode).toBe(200);
    const bodyCities = resCities.json();
    expect(Array.isArray(bodyCities.cities)).toBe(true);
    expect(bodyCities.cities.some((c: any) => c.city === 'Tirupati')).toBe(true);
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
    const catererHeaders = {
      'x-user-id': 'c0000000-0000-0000-0000-000000000002',
      'x-user-role': 'caterer',
    };

    // 1. Add blackout date
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/caterers/${catererId}/blackout-dates`,
      headers: catererHeaders,
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
      headers: catererHeaders,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);
  });

  it('allows admin to list all caterers and update caterer status', async () => {
    const adminHeaders = {
      'x-user-id': 'c0000000-0000-0000-0000-000000000003',
      'x-user-role': 'admin',
    };

    // 1. List all caterers
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/caterers',
      headers: adminHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const caterers = listRes.json().caterers;
    expect(Array.isArray(caterers)).toBe(true);
    expect(caterers.length).toBeGreaterThanOrEqual(1);

    // 2. Reject caterer without reason -> 400
    const failRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/caterers/${caterers[0].id}/status`,
      headers: adminHeaders,
      payload: { status: 'rejected' },
    });
    expect(failRes.statusCode).toBe(400);

    // 3. Update caterer status to approved
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/caterers/${caterers[0].id}/status`,
      headers: adminHeaders,
      payload: { status: 'approved' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().caterer.status).toBe('approved');
  });

  it('allows admin to configure custom commission_pct and rejects non-admin', async () => {
    const targetCatererId = 'd0000000-0000-0000-0000-000000000001';
    // 1. Non-admin is rejected
    const nonAdminRes = await app.inject({
      method: 'PATCH',
      url: `/api/caterers/${targetCatererId}`,
      headers: {
        'x-user-id': 'customer-uuid-0001',
        'x-user-role': 'customer',
      },
      payload: {
        commissionPct: 12.5,
      },
    });
    expect(nonAdminRes.statusCode).toBe(403);

    // 2. Admin successfully updates commission_pct
    const adminRes = await app.inject({
      method: 'PATCH',
      url: `/api/caterers/${targetCatererId}`,
      headers: {
        'x-user-id': 'admin-uuid-0001',
        'x-user-role': 'admin',
      },
      payload: {
        commissionPct: 12.5,
      },
    });
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.json().caterer.commissionPct).toBe(12.5);

    // 3. Verify in database
    const q = await pgPool.query('SELECT commission_pct FROM caterer_svc.caterers WHERE id = $1', [targetCatererId]);
    expect(Number(q.rows[0].commission_pct)).toBe(12.5);

    // Reset back to default 15.00% for other test suites
    await pgPool.query('UPDATE caterer_svc.caterers SET commission_pct = 15.00 WHERE id = $1', [targetCatererId]);
  });
});