import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper } from '../harness';

describe('Feature 3: Razorpay Daily Reconciliation (P1-1)', () => {
  const client = createApiClient();

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-01-01: Reconciliation database tables exist with required audit columns', async () => {
    const runsTable = await dbHelper.query(
      `SELECT column_name, data_type FROM information_schema.columns 
       WHERE table_schema = 'pay_svc' AND table_name = 'reconciliation_runs'`,
    );
    expect(runsTable.length).toBeGreaterThan(0);
    const colNames = runsTable.map((r: any) => r.column_name);
    expect(colNames).toContain('period_start');
    expect(colNames).toContain('period_end');
    expect(colNames).toContain('status');
    expect(colNames).toContain('matched_count');
    expect(colNames).toContain('discrepancy_count');

    const discTable = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'pay_svc' AND table_name = 'reconciliation_discrepancies'`,
    );
    expect(discTable.length).toBeGreaterThan(0);
    const discCols = discTable.map((r: any) => r.column_name);
    expect(discCols).toContain('run_id');
    expect(discCols).toContain('discrepancy_type');
    expect(discCols).toContain('status');
  });

  it('TC-P1-01-02: Non-admin caller receives 403 Forbidden when requesting reconciliation run', async () => {
    const res = await client.post(
      '/api/admin/reconciliation/run',
      { from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' },
      { role: 'customer' },
    );
    expect(res.status).toBe(403);
    expect(res.body.error || res.body.message).toBeDefined();
  });

  it('TC-P1-01-03: Admin execution of POST /api/admin/reconciliation/run responds with run summary', async () => {
    const res = await client.post(
      '/api/admin/reconciliation/run',
      {
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-02T00:00:00Z',
        autoHeal: true,
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('runId');
    expect(typeof res.body.matched).toBe('number');
  });

  it('TC-P1-01-04: Admin can retrieve reconciliation runs history via GET /api/admin/reconciliation/runs', async () => {
    const res = await client.get('/api/admin/reconciliation/runs', { role: 'admin' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.runs || res.body)).toBe(true);
  });

  it('TC-P1-01-05: Discrepancy table enforces valid discrepancy_type values', async () => {
    const sampleRun = await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_runs (period_start, period_end, status)
       VALUES (now() - interval '1 day', now(), 'completed')
       RETURNING id`,
    );
    const runId = sampleRun[0].id;

    // Valid insert
    await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_discrepancies (run_id, discrepancy_type, status, razorpay_entity_id)
       VALUES ($1, 'amount_mismatch', 'open', 'pay_test_001')`,
      [runId],
    );

    // Invalid insert must fail check constraint
    let failed = false;
    try {
      await dbHelper.query(
        `INSERT INTO pay_svc.reconciliation_discrepancies (run_id, discrepancy_type, status)
         VALUES ($1, 'invalid_type_error', 'open')`,
        [runId],
      );
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);

    // Clean up test discrepancy and run
    await dbHelper.query(`DELETE FROM pay_svc.reconciliation_runs WHERE id = $1`, [runId]);
  });

  it('TC-P1-01-06: Invalid reconciliation date range (from > to) is rejected with 400', async () => {
    const res = await client.post(
      '/api/admin/reconciliation/run',
      {
        from: '2026-11-10T00:00:00Z',
        to: '2026-11-01T00:00:00Z', // Inverted range
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(400);
  });
});
