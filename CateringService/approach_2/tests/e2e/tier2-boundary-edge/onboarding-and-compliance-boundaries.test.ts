import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { catererOnboardingSchema } from '@caterconnect/shared';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  mintTestJwt,
  dbHelper,
  TEST_CATERER,
  TEST_USERS,
} from '../harness';

describe('Tier 2: Onboarding & Compliance Boundaries (P1-8, P1-9, P1-14)', () => {
  const client = createApiClient();
  let sampleCatererId: string;

  beforeAll(async () => {
    await startAllServers();

    const caterers = await dbHelper.query(
      `SELECT id, status FROM caterer_svc.caterers ORDER BY created_at DESC LIMIT 5`,
    );
    if (caterers.length > 0) {
      sampleCatererId = caterers[0].id;
    }
  });

  afterAll(async () => {
    await stopAllServers();
  });

  // ==============================================================
  // P1-8 Onboarding Status Boundaries (TC-T2-ONB-01 to 06)
  // ==============================================================

  it('TC-T2-ONB-01: Admin updating caterer to needs_correction without notes returns 400 Bad Request', async () => {
    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.patch(
      `/api/admin/caterers/${targetId}/status`,
      { status: 'needs_correction' },
      { role: 'admin' },
    );
    expect(res.status).toBe(400);
  });

  it('TC-T2-ONB-02: Admin updating caterer to needs_correction with empty whitespace notes returns 400 Bad Request', async () => {
    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.patch(
      `/api/admin/caterers/${targetId}/status`,
      { status: 'needs_correction', notes: '    ' },
      { role: 'admin' },
    );
    expect(res.status).toBe(400);
  });

  it('TC-T2-ONB-03: Admin updating caterer to rejected without rejectionReason returns 400 Bad Request', async () => {
    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.patch(
      `/api/admin/caterers/${targetId}/status`,
      { status: 'rejected' },
      { role: 'admin' },
    );
    expect(res.status).toBe(400);
  });

  it('TC-T2-ONB-04: Non-admin caller receives 403 Forbidden when attempting to modify onboarding status', async () => {
    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.patch(
      `/api/admin/caterers/${targetId}/status`,
      { status: 'approved' },
      { role: 'caterer' },
    );
    expect(res.status).toBe(403);
  });

  it('TC-T2-ONB-05: Caterer in needs_correction or under_review status cannot receive customer booking requests', async () => {
    const cat = await dbHelper.query(
      `INSERT INTO caterer_svc.caterers (owner_id, business_name, city, fssai_number, status)
       VALUES (gen_random_uuid(), 'Correction Caterer', 'Tirupati', '10123456789012', 'needs_correction')
       RETURNING id`,
    );
    const unapprovedCatId = cat[0].id;

    const res = await client.post(
      '/api/bookings',
      {
        catererId: unapprovedCatId,
        packageId: TEST_CATERER.packageId,
        eventDate: '2026-12-25',
        eventTime: '19:00:00',
        guestCount: 150,
        venueAddress: '12 Temple St',
        city: 'Tirupati',
        state: 'Andhra Pradesh',
      },
      { role: 'customer' },
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not approved');

    await dbHelper.query(`DELETE FROM caterer_svc.caterers WHERE id = $1`, [unapprovedCatId]);
  });

  it('TC-T2-ONB-06: Public search endpoint GET /api/caterers strictly excludes non-approved caterers', async () => {
    const res = await client.get('/api/caterers?city=Tirupati');
    expect(res.status).toBe(200);
    const caterers = res.body.caterers || res.body;
    if (Array.isArray(caterers)) {
      for (const cat of caterers) {
        expect(cat.status).not.toBe('needs_correction');
        expect(cat.status).not.toBe('under_review');
        expect(cat.status).not.toBe('rejected');
      }
    }
  });

  // ==============================================================
  // P1-9 FSSAI Validation & Signed URLs (TC-T2-ONB-07 to 12)
  // ==============================================================

  it('TC-T2-ONB-07: Caterer registration/update with 13-digit FSSAI is rejected with 400 Bad Request', () => {
    const parsed = catererOnboardingSchema.shape.fssaiNumber.safeParse('1002003004001');
    expect(parsed.success).toBe(false);
  });

  it('TC-T2-ONB-08: Caterer registration/update with 15-digit FSSAI is rejected with 400 Bad Request', () => {
    const parsed = catererOnboardingSchema.shape.fssaiNumber.safeParse('100200300400123');
    expect(parsed.success).toBe(false);
  });

  it('TC-T2-ONB-09: Caterer registration/update with alphanumeric FSSAI is rejected with 400 Bad Request', () => {
    const parsed = catererOnboardingSchema.shape.fssaiNumber.safeParse('1002003004ABCD');
    expect(parsed.success).toBe(false);
  });

  it('TC-T2-ONB-10: Signed document preview URL token expires after 15 minutes (900 seconds)', async () => {
    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.get(
      `/api/caterers/${targetId}/documents/fssai_certificate/signed-url`,
      { role: 'admin' },
    );
    expect(res.status).toBe(200);
    expect(res.body.signedUrl).toContain('token=');
    expect(res.body.expiresAt).toBeDefined();

    const expiryDate = new Date(res.body.expiresAt);
    const diffMs = expiryDate.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(800 * 1000);
    expect(diffMs).toBeLessThanOrEqual(900 * 1000 + 5000);
  });

  it('TC-T2-ONB-11: Accessing signed URL with tampered HMAC signature returns 401 Unauthorized', async () => {
    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.get(
      `/api/caterers/${targetId}/documents/fssai_certificate?token=tampered_invalid_token&expiresAt=${new Date(Date.now() + 600000).toISOString()}`,
    );
    expect(res.status).toBe(401);
  });

  it('TC-T2-ONB-12: BOLA guard: Caterer A requesting signed URL for Caterer B document returns 403 Forbidden', async () => {
    const rogueCatererToken = mintTestJwt({
      sub: '00000000-0000-0000-0000-000000009999',
      role: 'caterer',
      email: 'competitor@example.com',
    });

    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.get(
      `/api/caterers/${targetId}/documents/fssai_certificate/signed-url`,
      { token: rogueCatererToken },
    );
    expect(res.status).toBe(403);
  });

  // ==============================================================
  // P1-14 Photo Gate Pre-Approval (TC-T2-ONB-13 to 16)
  // ==============================================================

  it('TC-T2-ONB-13: Admin approval of caterer with 0 packages is rejected with 422 PHOTOS_REQUIRED', async () => {
    const tempCat = await dbHelper.query(
      `INSERT INTO caterer_svc.caterers (owner_id, business_name, city, fssai_number, status)
       VALUES (gen_random_uuid(), 'Empty Caterer Services', 'Tirupati', '10123456789012', 'under_review')
       RETURNING id`,
    );
    const emptyCatId = tempCat[0].id;

    const res = await client.patch(
      `/api/admin/caterers/${emptyCatId}/status`,
      { status: 'approved' },
      { role: 'admin' },
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PHOTOS_REQUIRED');

    await dbHelper.query(`DELETE FROM caterer_svc.caterers WHERE id = $1`, [emptyCatId]);
  });

  it('TC-T2-ONB-14: Admin approval of caterer with package having null imageUrl is rejected with 422 PHOTOS_REQUIRED', async () => {
    const tempCat = await dbHelper.query(
      `INSERT INTO caterer_svc.caterers (owner_id, business_name, city, fssai_number, status)
       VALUES (gen_random_uuid(), 'Missing Pkg Photo Caterer', 'Tirupati', '10123456789012', 'under_review')
       RETURNING id`,
    );
    const catId = tempCat[0].id;

    await dbHelper.query(
      `INSERT INTO caterer_svc.packages (caterer_id, name, description, price_per_plate_paise, min_guests, image_url)
       VALUES ($1, 'Wedding Feast', 'Test', 45000, 50, NULL)`,
      [catId],
    );

    const res = await client.patch(
      `/api/admin/caterers/${catId}/status`,
      { status: 'approved' },
      { role: 'admin' },
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PHOTOS_REQUIRED');

    await dbHelper.query(`DELETE FROM caterer_svc.packages WHERE caterer_id = $1`, [catId]);
    await dbHelper.query(`DELETE FROM caterer_svc.caterers WHERE id = $1`, [catId]);
  });

  it('TC-T2-ONB-15: Admin approval of caterer with menu item having null or empty imageUrl is rejected with 422 PHOTOS_REQUIRED', async () => {
    const tempCat = await dbHelper.query(
      `INSERT INTO caterer_svc.caterers (owner_id, business_name, city, fssai_number, status)
       VALUES (gen_random_uuid(), 'Missing Dish Photo Caterer', 'Tirupati', '10123456789012', 'under_review')
       RETURNING id`,
    );
    const catId = tempCat[0].id;

    await dbHelper.query(
      `INSERT INTO caterer_svc.packages (caterer_id, name, description, price_per_plate_paise, min_guests, image_url)
       VALUES ($1, 'Valid Feast', 'Test', 45000, 50, 'https://cdn.caterconnect.in/valid.jpg')`,
      [catId],
    );

    await dbHelper.query(
      `INSERT INTO caterer_svc.menu_items (caterer_id, name, description, category, is_veg, price_paise, image_url)
       VALUES ($1, 'Gulab Jamun', 'Dessert', 'dessert', true, 10000, '')`,
      [catId],
    );

    const res = await client.patch(
      `/api/admin/caterers/${catId}/status`,
      { status: 'approved' },
      { role: 'admin' },
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PHOTOS_REQUIRED');

    await dbHelper.query(`DELETE FROM caterer_svc.menu_items WHERE caterer_id = $1`, [catId]);
    await dbHelper.query(`DELETE FROM caterer_svc.packages WHERE caterer_id = $1`, [catId]);
    await dbHelper.query(`DELETE FROM caterer_svc.caterers WHERE id = $1`, [catId]);
  });

  it('TC-T2-ONB-16: Photo gate restricts only approved status and permits transitions to needs_correction or under_review', async () => {
    const targetId = sampleCatererId || TEST_CATERER.id;
    const res = await client.patch(
      `/api/admin/caterers/${targetId}/status`,
      { status: 'under_review' },
      { role: 'admin' },
    );
    expect(res.status).toBe(200);
  });
});
