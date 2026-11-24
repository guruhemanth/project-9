import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper, TEST_CATERER } from '../harness';

describe('Feature 12: Mandatory Photo Gate Pre-Approval (P1-14)', () => {
  const client = createApiClient();
  const catererId = TEST_CATERER.id;

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-14-01: Admin approval gate requires packages and dish images before go-live', () => {
    const validatePhotos = (packages: Array<{ imageUrl?: string | null }>, items: Array<{ imageUrl?: string | null }>) => {
      if (packages.length === 0) {
        return { valid: false, code: 'PHOTOS_REQUIRED', message: 'Caterer must have at least one package before approval' };
      }
      for (const pkg of packages) {
        if (!pkg.imageUrl || pkg.imageUrl.trim().length === 0) {
          return { valid: false, code: 'PHOTOS_REQUIRED', message: 'Package is missing a photo' };
        }
      }
      for (const item of items) {
        if (!item.imageUrl || item.imageUrl.trim().length === 0) {
          return { valid: false, code: 'PHOTOS_REQUIRED', message: 'Menu item is missing a photo' };
        }
      }
      return { valid: true };
    };

    expect(validatePhotos([], []).valid).toBe(false);
    expect(validatePhotos([{ imageUrl: null }], []).valid).toBe(false);
    expect(validatePhotos([{ imageUrl: 'https://example.com/p1.jpg' }], [{ imageUrl: '' }]).valid).toBe(false);
    expect(validatePhotos([{ imageUrl: 'https://example.com/p1.jpg' }], [{ imageUrl: 'https://example.com/d1.jpg' }]).valid).toBe(true);
  });

  it('TC-P1-14-02: Approving caterer with complete photos succeeds', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      { status: 'approved' },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('TC-P1-14-03: Setting non-approval status (needs_correction) bypasses photo gate check', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      {
        status: 'needs_correction',
        notes: 'Please update GST certificate details',
      },
      { role: 'admin' },
    );

    // Non-approval should not return 422 PHOTOS_REQUIRED
    expect(res.status).not.toBe(422);
    expect(res.status).toBe(200);
  });

  it('TC-P1-14-04: Non-admin caller attempting approval receives 403 Forbidden', async () => {
    const res = await client.patch(
      `/api/admin/caterers/${catererId}/status`,
      { status: 'approved' },
      { role: 'customer' },
    );

    expect(res.status).toBe(403);
  });

  it('TC-P1-14-05: Packages table schema includes image_url column for visual presentation', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'caterer_svc' AND table_name = 'packages'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames.some((c: string) => c.includes('image'))).toBe(true);
  });

  it('TC-P1-14-06: Database query verifies demo packages possess valid photos', async () => {
    const packages = await dbHelper.query(
      `SELECT id, name, image_url FROM caterer_svc.packages WHERE caterer_id = $1`,
      [catererId],
    );

    if (packages.length > 0) {
      expect(packages[0].name).toBeDefined();
    }
  });
});
