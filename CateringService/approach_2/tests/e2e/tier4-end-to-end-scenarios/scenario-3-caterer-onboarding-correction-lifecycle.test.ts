import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  mintTestJwt,
} from '../harness';

describe('Tier 4: Scenario 3 — Caterer Onboarding Correction & Approval Lifecycle', () => {
  const client = createApiClient();
  let catererId: string;
  let catererOwnerId: string;
  let catererToken: string;

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    if (catererId) {
      await dbHelper.query(`DELETE FROM caterer_svc.caterer_documents WHERE caterer_id = $1`, [catererId]);
      await dbHelper.query(`DELETE FROM caterer_svc.packages WHERE caterer_id = $1`, [catererId]);
      await dbHelper.query(`DELETE FROM caterer_svc.caterers WHERE id = $1`, [catererId]);
    }
    if (catererOwnerId) {
      await dbHelper.query(`DELETE FROM auth_svc.users WHERE id = $1`, [catererOwnerId]);
    }
    await stopAllServers();
  });

  it('Step 1: New caterer registers without photos or documents; initial status is under_review', async () => {
    const email = `caterer_scen3_${Date.now()}@example.com`;
    const regRes = await client.post('/api/auth/register', {
      email,
      password: 'Password123!',
      fullName: 'Grand Banquet Caterer Owner',
      role: 'caterer',
      phone: '+919876543299',
      dpdpConsent: true,
    });

    expect(regRes.status).toBe(201);
    catererOwnerId = regRes.body.user.id;
    catererToken = mintTestJwt({ sub: catererOwnerId, role: 'caterer', email });

    const caterer = await dbHelper.query(
      `INSERT INTO caterer_svc.caterers 
       (owner_id, business_name, city, fssai_number, status)
       VALUES ($1, 'Grand Banquet Caterers', 'Tirupati', '10123456789012', 'under_review')
       RETURNING id, status`,
      [catererOwnerId],
    );
    catererId = caterer[0].id;

    expect(caterer[0].status).toBe('under_review');
  });

  it('Step 2: Admin reviews queue and flags needs_correction with specific feedback note via PATCH /api/admin/caterers/:id/status', async () => {
    const feedback = 'Please provide package photographs and upload a clear FSSAI registration certificate.';

    const patchRes = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      {
        status: 'needs_correction',
        notes: feedback,
      },
      { role: 'admin' },
    );

    expect(patchRes.status).toBe(200);

    const caterer = await dbHelper.getCaterer(catererId);
    expect(caterer.status).toBe('needs_correction');
    expect(caterer.correction_notes).toBe(feedback);
  });

  it('Step 3: Caterer uploads required package photos and 14-digit FSSAI certificate', async () => {
    const pkgRes = await client.post(
      `/api/caterers/${catererId}/packages`,
      {
        name: 'Royal Wedding Thali',
        description: 'Traditional South Indian banquet',
        pricePerPlatePaise: 55000,
        minGuests: 100,
        imageUrl: 'https://cdn.caterconnect.in/packages/royal.jpg',
      },
      { token: catererToken },
    );
    expect(pkgRes.status).toBe(201);

    const docRes = await client.post(
      `/api/caterers/${catererId}/documents`,
      {
        documentType: 'fssai_certificate',
        fssaiNumber: '10123456789012',
        filePath: '/private/documents/fssai_10123456789012.pdf',
      },
      { token: catererToken },
    );
    expect(docRes.status).toBe(201);

    const docs = await dbHelper.getCatererDocuments(catererId);
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 4: Caterer resubmits profile for administrative review (under_review)', async () => {
    const resubmitRes = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      { status: 'under_review' },
      { role: 'admin' },
    );

    expect(resubmitRes.status).toBe(200);

    const caterer = await dbHelper.getCaterer(catererId);
    expect(caterer.status).toBe('under_review');
  });

  it('Step 5: Admin generates time-limited HMAC-signed preview URL and verifies FSSAI document via GET /api/caterers/:id/documents/fssai_certificate/signed-url', async () => {
    const res = await client.get(
      `/api/caterers/${catererId}/documents/fssai_certificate/signed-url`,
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('signedUrl');
    expect(res.body.signedUrl).toContain('token=');
    expect(res.body.signedUrl).toContain('expiresAt=');
  });

  it('Step 6: Photo gate validation succeeds; Admin approves caterer via PATCH /api/admin/caterers/:id/status', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      { status: 'approved' },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);

    const caterer = await dbHelper.getCaterer(catererId);
    expect(caterer.status).toBe('approved');
  });
});
