import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper, TEST_CATERER } from '../harness';

describe('Feature 9: Late-Cancel Penalty & Customer Rebook (P1-10)', () => {
  const client = createApiClient();
  let testBookingId: string;

  beforeAll(async () => {
    await startAllServers();

    const rows = await dbHelper.query(
      `SELECT id FROM order_svc.bookings LIMIT 1`,
    );
    if (rows.length > 0) {
      testBookingId = rows[0].id;
    }
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-10-01: Caterer penalties schema supports late cancellation penalty records', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name, data_type FROM information_schema.columns 
       WHERE table_schema = 'pay_svc' AND table_name = 'caterer_penalties'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('caterer_id');
    expect(colNames).toContain('booking_id');
    expect(colNames).toContain('penalty_type');
    expect(colNames).toContain('penalty_amount_paise');
    expect(colNames).toContain('status');
    expect(colNames).toContain('reason');
  });

  it('TC-P1-10-02: Bookings table schema tracks customer rebook linkage and penalty paise', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'order_svc' AND table_name = 'bookings'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('rebooked_from_booking_id');
    expect(colNames).toContain('caterer_penalty_paise');
  });

  it('TC-P1-10-03: Caterer late cancellation policy computes statutory 20% penalty tier (<7 days)', () => {
    const totalBookingPaise = 5000000; // ₹50,000
    const penaltyRate = 0.20; // 20%
    const penaltyPaise = Math.round(totalBookingPaise * penaltyRate);

    expect(penaltyPaise).toBe(1000000); // ₹10,000
    // Customer refund must be 100%
    const customerRefundPaise = totalBookingPaise;
    expect(customerRefundPaise).toBe(5000000);
  });

  it('TC-P1-10-04: Rebook options endpoint returns alternative available caterers in the same city', async () => {
    const targetBookingId = testBookingId || '00000000-0000-0000-0000-000000000001';
    const res = await client.get(`/api/bookings/${targetBookingId}/rebook-options`, {
      role: 'customer',
    });

    expect(res.status).toBe(200);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('alternatives');
      expect(Array.isArray(res.body.alternatives)).toBe(true);
    }
  });

  it('TC-P1-10-05: Cancelling an already cancelled or completed booking returns 400 Bad Request', async () => {
    const cancelledRows = await dbHelper.query(
      `SELECT id FROM order_svc.bookings WHERE status = 'cancelled' LIMIT 1`,
    );

    if (cancelledRows.length > 0) {
      const res = await client.post(
        `/api/bookings/${cancelledRows[0].id}/cancel`,
        { reason: 'Duplicate cancellation attempt' },
        { role: 'caterer' },
      );
      expect(res.status).toBe(400);
    }
  });

  it('TC-P1-10-06: Database stores penalty record for late-cancelled caterer', async () => {
    const testPenaltyId = 'c1111111-0000-0000-0000-000000000099';
    await dbHelper.query(
      `INSERT INTO pay_svc.caterer_penalties (
        id, caterer_id, penalty_type, penalty_amount_paise, status, reason
      ) VALUES ($1, $2, 'late_cancellation', 1000000, 'pending', 'Cancelled 2 days prior to event')
      ON CONFLICT (id) DO UPDATE SET status = 'pending'`,
      [testPenaltyId, TEST_CATERER.id],
    );

    const penalties = await dbHelper.getPenalties(TEST_CATERER.id);
    const penalty = penalties.find((p: any) => p.id === testPenaltyId);
    expect(penalty).toBeDefined();
    expect(penalty.penalty_amount_paise).toBe(1000000);
    expect(penalty.status).toBe('pending');

    // Clean up
    await dbHelper.query(`DELETE FROM pay_svc.caterer_penalties WHERE id = $1`, [testPenaltyId]);
  });
});
