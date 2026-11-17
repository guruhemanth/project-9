import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  TEST_USERS,
} from '../harness';

describe('Tier 3: Onboarding Photo Gate ↔ FSSAI ↔ Correction Status Interaction', () => {
  const client = createApiClient();
  let testCatererId: string;

  beforeAll(async () => {
    await startAllServers();

    // Create an onboarding caterer in 'under_review' status without photos using fresh owner_id
    const cat = await dbHelper.query(
      `INSERT INTO caterer_svc.caterers 
       (owner_id, business_name, city, fssai_number, status)
       VALUES (gen_random_uuid(), 'Interaction Test Caterer', 'Tirupati', '10123456789012', 'under_review')
       RETURNING id`,
    );
    testCatererId = cat[0].id;
  });

  afterAll(async () => {
    if (testCatererId) {
      await dbHelper.query(`DELETE FROM caterer_svc.caterer_documents WHERE caterer_id = $1`, [testCatererId]);
      await dbHelper.query(`DELETE FROM caterer_svc.packages WHERE caterer_id = $1`, [testCatererId]);
      await dbHelper.query(`DELETE FROM caterer_svc.caterers WHERE id = $1`, [testCatererId]);
    }
    await stopAllServers();
  });

  it('TC-T3-ONB-01: Photo gate pre-approval blocks approval on missing photos, directing admin to request corrections', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${testCatererId}/status`,
      { status: 'approved' },
      { role: 'admin' },
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PHOTOS_REQUIRED');
  });

  it('TC-T3-ONB-02: Admin sets needs_correction status with notes specifying missing photo and certificate requirements via PATCH /api/admin/caterers/:id/status', async () => {
    const correctionNotes = 'Please upload high-resolution package photos and a readable FSSAI certificate.';

    const res = await client.patch(
      `/api/admin/caterers/${testCatererId}/status`,
      { status: 'needs_correction', notes: correctionNotes },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body.caterer.status).toBe('needs_correction');

    const caterer = await dbHelper.getCaterer(testCatererId);
    expect(caterer.status).toBe('needs_correction');
    expect(caterer.correction_notes).toBe(correctionNotes);
  });

  it('TC-T3-ONB-03: Caterer uploads package photos and 14-digit FSSAI certificate, transitioning back to under_review', async () => {
    await dbHelper.query(
      `INSERT INTO caterer_svc.packages 
       (caterer_id, name, description, price_per_plate_paise, min_guests, image_url)
       VALUES ($1, 'Deluxe Feast', 'Comprehensive wedding feast', 45000, 50, 'https://cdn.caterconnect.in/packages/deluxe.jpg')`,
      [testCatererId],
    );

    await dbHelper.query(
      `INSERT INTO caterer_svc.caterer_documents 
       (caterer_id, doc_type, file_url, status)
       VALUES ($1, 'fssai_certificate', 'https://storage.caterconnect.in/docs/fssai_10123456789012.pdf', 'verified')`,
      [testCatererId],
    );

    const res = await client.patch(
      `/api/admin/caterers/${testCatererId}/status`,
      { status: 'under_review' },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body.caterer.status).toBe('under_review');

    const updated = await dbHelper.getCaterer(testCatererId);
    expect(updated.status).toBe('under_review');
  });

  it('TC-T3-ONB-04: Admin accesses 15-minute signed preview URL to verify FSSAI document and successfully approves caterer', async () => {
    const signRes = await client.get(
      `/api/caterers/${testCatererId}/documents/fssai_certificate/signed-url`,
      { role: 'admin' },
    );

    expect(signRes.status).toBe(200);
    expect(signRes.body.signedUrl).toBeDefined();
    expect(signRes.body.expiresAt).toBeDefined();

    const approveRes = await client.patch(
      `/api/admin/caterers/${testCatererId}/status`,
      { status: 'approved' },
      { role: 'admin' },
    );

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.caterer.status).toBe('approved');

    const approved = await dbHelper.getCaterer(testCatererId);
    expect(approved.status).toBe('approved');
  });
});
