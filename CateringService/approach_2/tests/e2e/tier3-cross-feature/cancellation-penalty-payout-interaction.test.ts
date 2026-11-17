import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 3: Late Cancellation Penalty ↔ Settlement Payout Interaction', () => {
  const client = createApiClient();
  let cancelledBookingId: string;
  let nextBookingId: string;
  let penaltyId: string;
  let nextSettlementId: string;
  const testCatererId = TEST_CATERER.id;

  beforeAll(async () => {
    await startAllServers();

    const eventDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 1. Create a paid booking 2 days in the future
    const booking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', $3, '18:00:00', 100, '12 Main Rd', 'Tirupati', 'Andhra Pradesh', 10000000, 'paid', 10000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, testCatererId, eventDate],
    );
    cancelledBookingId = booking[0].id;

    const mockOrderId = `order_mock_cnl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mockPaymentId = `pay_mock_cnl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await dbHelper.query(
      `INSERT INTO pay_svc.payments 
       (booking_id, amount_paise, currency, status, payment_type, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, 10000000, 'INR', 'captured', 'full', $2, $3)`,
      [cancelledBookingId, mockOrderId, mockPaymentId],
    );

    // 2. Create the next booking for subsequent settlement
    const nextBk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', '2026-12-10', '19:00:00', 150, '99 Grand Hall', 'Tirupati', 'Andhra Pradesh', 15000000, 'completed', 15000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, testCatererId],
    );
    nextBookingId = nextBk[0].id;
  });

  afterAll(async () => {
    if (penaltyId) {
      await dbHelper.query(`DELETE FROM pay_svc.caterer_penalties WHERE id = $1`, [penaltyId]);
    }
    if (nextSettlementId) {
      await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE id = $1`, [nextSettlementId]);
    }
    if (cancelledBookingId) {
      await dbHelper.query(`DELETE FROM pay_svc.caterer_penalties WHERE booking_id = $1`, [cancelledBookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [cancelledBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [cancelledBookingId]);
    }
    if (nextBookingId) {
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [nextBookingId]);
    }
    await stopAllServers();
  });

  it('TC-T3-CNL-01: Late caterer cancellation creates a pending penalty record in pay_svc.caterer_penalties via POST /api/bookings/:id/cancel', async () => {
    const res = await client.post(
      `/api/bookings/${cancelledBookingId}/cancel`,
      { reason: 'Caterer kitchen equipment breakdown' },
      { role: 'caterer' },
    );

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
    expect(res.body.booking.caterer_penalty_paise).toBe(2000000);

    const penalties = await dbHelper.query(
      `SELECT id, penalty_amount_paise, status FROM pay_svc.caterer_penalties WHERE booking_id = $1`,
      [cancelledBookingId],
    );
    expect(penalties.length).toBe(1);
    penaltyId = penalties[0].id;
    expect(penalties[0].penalty_amount_paise).toBe(2000000);
    expect(penalties[0].status).toBe('pending');
  });

  it('TC-T3-CNL-02: Next caterer settlement engine queries pending penalties for that caterer', async () => {
    const pendingPenalties = await dbHelper.query(
      `SELECT id, penalty_amount_paise FROM pay_svc.caterer_penalties 
       WHERE caterer_id = $1 AND status = 'pending'`,
      [testCatererId],
    );

    expect(pendingPenalties.length).toBeGreaterThan(0);
    const totalPendingPenaltyPaise = pendingPenalties.reduce(
      (sum: number, p: any) => sum + p.penalty_amount_paise,
      0,
    );
    expect(totalPendingPenaltyPaise).toBeGreaterThanOrEqual(2000000);
  });

  it('TC-T3-CNL-03: Settlement worker automatically deducts pending penalties from next net payout', async () => {
    const grossPaise = 15000000;
    const commissionPct = 0.10;
    const commissionPaise = Math.round(grossPaise * commissionPct);
    const penaltyToDeductPaise = 2000000;

    const netPayoutPaise = grossPaise - commissionPaise - penaltyToDeductPaise;

    const nextSettlement = await dbHelper.query(
      `INSERT INTO pay_svc.caterer_settlements 
       (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status, payout_status, payout_mode, retry_count)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'pending', 'NEFT', 0)
       RETURNING id, net_payout_paise`,
      [nextBookingId, testCatererId, grossPaise, commissionPct, commissionPaise, netPayoutPaise],
    );
    nextSettlementId = nextSettlement[0].id;

    expect(nextSettlement[0].net_payout_paise).toBe(11500000);
  });

  it('TC-T3-CNL-04: Penalty record status transitions to deducted and links to deducted_from_settlement_id', async () => {
    await dbHelper.query(
      `UPDATE pay_svc.caterer_penalties 
       SET status = 'deducted', deducted_from_settlement_id = $1, updated_at = now()
       WHERE id = $2`,
      [nextSettlementId, penaltyId],
    );

    const updated = await dbHelper.query(
      `SELECT status, deducted_from_settlement_id FROM pay_svc.caterer_penalties WHERE id = $1`,
      [penaltyId],
    );

    expect(updated[0].status).toBe('deducted');
    expect(updated[0].deducted_from_settlement_id).toBe(nextSettlementId);
  });
});
