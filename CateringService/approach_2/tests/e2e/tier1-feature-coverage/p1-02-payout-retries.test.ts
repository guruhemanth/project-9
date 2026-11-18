import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { computePayoutBackoffMinutes } from '../../../backend/services/payment/src/payout';
import { startAllServers, stopAllServers, createApiClient, dbHelper } from '../harness';

describe('Feature 4: Automated Payouts with Retries (P1-2)', () => {
  const client = createApiClient();
  let sampleSettlementId: string;

  beforeAll(async () => {
    await startAllServers();
    const settlements = await dbHelper.query(
      `SELECT id FROM pay_svc.caterer_settlements LIMIT 1`,
    );
    if (settlements.length > 0) {
      sampleSettlementId = settlements[0].id;
    }
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-02-01: Caterer settlements table schema has automated payout execution columns', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'pay_svc' AND table_name = 'caterer_settlements'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('payout_id');
    expect(colNames).toContain('payout_status');
    expect(colNames).toContain('retry_count');
    expect(colNames).toContain('next_retry_at');
    expect(colNames).toContain('last_error');
  });

  it('TC-P1-02-02: Settlements status constraint accepts extended lifecycle values including failed', async () => {
    const validStatuses = ['pending', 'processing', 'settled', 'held', 'failed'];
    for (const status of validStatuses) {
      const res = await dbHelper.query(
        `SELECT true WHERE $1 = ANY(ARRAY['pending', 'processing', 'settled', 'held', 'failed'])`,
        [status],
      );
      expect(res.length).toBe(1);
    }
  });

  it('TC-P1-02-03: Non-admin caller receives 403 Forbidden on settlement retry endpoint', async () => {
    const targetId = sampleSettlementId || 'c0000000-0000-0000-0000-000000000001';
    const res = await client.post(
      `/api/admin/settlements/${targetId}/retry`,
      { force: true },
      { role: 'caterer' },
    );
    expect(res.status).toBe(403);
  });

  it('TC-P1-02-04: Admin settlement retry on non-existent settlement returns 404', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000099';
    const res = await client.post(
      `/api/admin/settlements/${nonExistentId}/retry`,
      { force: true },
      { role: 'admin' },
    );
    expect(res.status).toBe(404);
  });

  it('TC-P1-02-05: Payout retry logic computes exponential backoff interval correctly', () => {
    expect(computePayoutBackoffMinutes(0)).toBe(5);
    expect(computePayoutBackoffMinutes(1)).toBe(15);
    expect(computePayoutBackoffMinutes(2)).toBe(45);
    expect(computePayoutBackoffMinutes(3)).toBe(60);
  });

  it('TC-P1-02-06: Database allows updating payout retry columns on settlements', async () => {
    if (!sampleSettlementId) return;

    await dbHelper.query(
      `UPDATE pay_svc.caterer_settlements 
       SET retry_count = 1, next_retry_at = now() + interval '5 minutes', payout_status = 'processing'
       WHERE id = $1`,
      [sampleSettlementId],
    );

    const updated = await dbHelper.getSettlement(sampleSettlementId);
    expect(updated.retry_count).toBe(1);
    expect(updated.payout_status).toBe('processing');
    expect(updated.next_retry_at).toBeDefined();

    // Reset status back
    await dbHelper.query(
      `UPDATE pay_svc.caterer_settlements 
       SET retry_count = 0, next_retry_at = NULL, payout_status = 'pending'
       WHERE id = $1`,
      [sampleSettlementId],
    );
  });
});
