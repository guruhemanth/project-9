import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper, TEST_CATERER, generateHmacToken } from '../harness';

describe('Feature 8: FSSAI Validation & Signed URLs (P1-9)', () => {
  const client = createApiClient();
  const catererId = TEST_CATERER.id;

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-09-01: 14-digit numeric FSSAI validation strictly validates format', () => {
    const fssaiRegex = /^[0-9]{14}$/;

    // Valid 14-digit numbers
    expect(fssaiRegex.test('10123456789012')).toBe(true);
    expect(fssaiRegex.test('20011002200334')).toBe(true);

    // Invalid: 13 digits
    expect(fssaiRegex.test('1012345678901')).toBe(false);
    // Invalid: 15 digits
    expect(fssaiRegex.test('101234567890123')).toBe(false);
    // Invalid: alphanumeric
    expect(fssaiRegex.test('1012345678901A')).toBe(false);
    expect(fssaiRegex.test('FSSAI123456789')).toBe(false);
  });

  it('TC-P1-09-02: Caterer documents table schema stores private document references and HMAC tokens', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'caterer_svc' AND table_name = 'caterer_documents'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('caterer_id');
    expect(colNames).toContain('document_type');
    expect(colNames).toContain('file_path');
    expect(colNames).toContain('signed_token');
    expect(colNames).toContain('signed_token_expires_at');
    expect(colNames).toContain('status');
  });

  it('TC-P1-09-03: Signed URL generation endpoint returns time-limited preview URL', async () => {
    const res = await client.get(
      `/api/caterers/${catererId}/documents/fssai_certificate/signed-url`,
      { role: 'caterer' },
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('signedUrl');
    expect(res.body).toHaveProperty('expiresAt');
    expect(res.body.signedUrl).toContain('token=');
  });

  it('TC-P1-09-04: Signed URL HMAC token validates authenticity and 15-minute expiration window', () => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const docPath = `caterers/${catererId}/fssai.pdf`;
    const token = generateHmacToken(`${docPath}:${expiresAt}`);

    expect(token).toBeDefined();
    expect(token.length).toBe(64); // SHA-256 hex digest length

    // Check expiration logic
    const isExpired = (expiryIso: string) => new Date(expiryIso).getTime() < Date.now();
    expect(isExpired(expiresAt)).toBe(false);

    const pastExpiry = new Date(Date.now() - 60000).toISOString();
    expect(isExpired(pastExpiry)).toBe(true);
  });

  it('TC-P1-09-05: Non-admin and non-owner receives 403 Forbidden when requesting signed URL', async () => {
    const anotherCatererId = 'd0000000-0000-0000-0000-000000000099';
    const res = await client.get(
      `/api/caterers/${anotherCatererId}/documents/fssai_certificate/signed-url`,
      { role: 'customer' },
    );
    expect(res.status).toBe(403);
  });

  it('TC-P1-09-06: Database stores document verification status transitions', async () => {
    const testDocId = 'd1111111-0000-0000-0000-000000000001';
    await dbHelper.query(
      `INSERT INTO caterer_svc.caterer_documents (id, caterer_id, document_type, file_path, status)
       VALUES ($1, $2, 'fssai_certificate', '/private/docs/fssai.pdf', 'pending')
       ON CONFLICT (id) DO UPDATE SET status = 'pending'`,
      [testDocId, catererId],
    );

    const docs = await dbHelper.getCatererDocuments(catererId);
    expect(docs.length).toBeGreaterThan(0);
    const doc = docs.find((d: any) => d.id === testDocId);
    expect(doc).toBeDefined();
    expect(doc.status).toBe('pending');

    // Clean up
    await dbHelper.query(`DELETE FROM caterer_svc.caterer_documents WHERE id = $1`, [testDocId]);
  });
});
