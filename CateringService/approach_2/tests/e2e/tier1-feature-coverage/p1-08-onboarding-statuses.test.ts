import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper, TEST_CATERER } from '../harness';

describe('Feature 7: Granular Onboarding Queue Statuses (P1-8)', () => {
  const client = createApiClient();
  let catererId: string;

  beforeAll(async () => {
    await startAllServers();
    const cat = await dbHelper.query(
      `INSERT INTO caterer_svc.caterers 
       (owner_id, business_name, city, fssai_number, status)
       VALUES (gen_random_uuid(), 'P1-08 Status Test Caterer', 'Tirupati', '10123456789012', 'under_review')
       RETURNING id`,
    );
    catererId = cat[0].id;
  });

  afterAll(async () => {
    if (catererId) {
      await dbHelper.query(`DELETE FROM caterer_svc.caterers WHERE id = $1`, [catererId]);
    }
    await stopAllServers();
  });

  it('TC-P1-08-01: Caterers table schema supports granular onboarding statuses and correction notes', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'caterer_svc' AND table_name = 'caterers'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('status');
    expect(colNames).toContain('correction_notes');
  });

  it('TC-P1-08-02: Database constraint accepts needs_correction and under_review statuses', async () => {
    const rows = await dbHelper.query(
      `SELECT pg_get_constraintdef(c.oid) as def
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'caterer_svc' AND c.conname = 'caterers_status_check'`,
    );
    expect(rows.length).toBe(1);
    const def = rows[0].def;
    expect(def).toContain('needs_correction');
    expect(def).toContain('under_review');
  });

  it('TC-P1-08-03: Non-admin caller cannot update caterer onboarding status (403 Forbidden)', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      { status: 'under_review' },
      { role: 'caterer' },
    );
    expect(res.status).toBe(403);
  });

  it('TC-P1-08-04: Admin status patch endpoint accepts needs_correction status with feedback notes', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      {
        status: 'needs_correction',
        notes: 'FSSAI certificate is blurry. Please upload a clear scan.',
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('TC-P1-08-05: Setting needs_correction without feedback notes is rejected with 400', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      {
        status: 'needs_correction',
        // Missing notes
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(400);
  });

  it('TC-P1-08-06: Caterers in needs_correction or under_review are excluded from public search', async () => {
    // Ensure test caterer is temporarily marked needs_correction in DB
    const originalStatus = (await dbHelper.getCaterer(catererId))?.status || 'approved';

    await dbHelper.query(
      `UPDATE caterer_svc.caterers SET status = 'needs_correction' WHERE id = $1`,
      [catererId],
    );

    const searchRes = await client.get('/api/caterers?city=Tirupati');
    expect(searchRes.status).toBe(200);

    const caterers = searchRes.body.caterers || searchRes.body || [];
    const found = caterers.find((c: any) => c.id === catererId);
    expect(found).toBeUndefined();

    // Revert status back
    await dbHelper.query(
      `UPDATE caterer_svc.caterers SET status = $1 WHERE id = $2`,
      [originalStatus, catererId],
    );
  });
});
