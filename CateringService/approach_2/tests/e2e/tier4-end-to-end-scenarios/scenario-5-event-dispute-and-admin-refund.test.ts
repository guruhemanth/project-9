import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 4: Scenario 5 — Event Dispute Filing & Admin Refund Resolution', () => {
  const client = createApiClient();
  let bookingId: string;
  let settlementId: string;
  let disputeId: string;
  const catererId = TEST_CATERER.id;
  const totalAmountPaise = 12000000; // ₹1,20,000

  beforeAll(async () => {
    await startAllServers();
    await dbHelper.query(
      `UPDATE caterer_svc.caterers SET status = 'approved' WHERE id = $1`,
      [catererId],
    );
  });

  afterAll(async () => {
    if (disputeId) {
      await dbHelper.query(`DELETE FROM order_svc.disputes WHERE id = $1`, [disputeId]);
    }
    if (settlementId) {
      await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE id = $1`, [settlementId]);
    }
    if (bookingId) {
      await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.booking_status_history WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bookingId]);
    }
    await stopAllServers();
  });

  it('Step 1: Event passes and booking is marked completed with pending settlement', async () => {
    const booking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', '2026-11-15', '19:00:00', 150, 'Main Hall', 'Tirupati', 'Andhra Pradesh', $3, 'completed', $3, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, catererId, totalAmountPaise],
    );
    bookingId = booking[0].id;

    const mockOrderId = `order_mock_disp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mockPaymentId = `pay_mock_disp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    await dbHelper.query(
      `INSERT INTO pay_svc.payments 
       (booking_id, amount_paise, currency, status, payment_type, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, $2, 'INR', 'captured', 'full', $3, $4)`,
      [bookingId, totalAmountPaise, mockOrderId, mockPaymentId],
    );

    const commissionPaise = 1200000;
    const netPayoutPaise = totalAmountPaise - commissionPaise;

    const settlement = await dbHelper.query(
      `INSERT INTO pay_svc.caterer_settlements 
       (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status, payout_status, payout_mode, retry_count)
       VALUES ($1, $2, $3, 0.10, $4, $5, 'pending', 'pending', 'NEFT', 0)
       RETURNING id`,
      [bookingId, catererId, totalAmountPaise, commissionPaise, netPayoutPaise],
    );
    settlementId = settlement[0].id;

    expect(bookingId).toBeDefined();
    expect(settlementId).toBeDefined();
  });

  it('Step 2: Customer files dispute with evidence URLs within 7 days post-event via POST /api/bookings/:id/disputes', async () => {
    const res = await client.post(
      `/api/bookings/${bookingId}/disputes`,
      {
        category: 'food_quality',
        description: 'Food was served cold and desserts missing',
        evidenceUrls: ['https://cdn.caterconnect.in/ev1.jpg'],
        refundRequestedPaise: 3000000,
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.disputeId).toBeDefined();
    disputeId = res.body.disputeId;

    const dispute = await dbHelper.getDisputeById(disputeId);
    expect(dispute.status).toBe('open');
    expect(dispute.category).toBe('food_quality');
  });

  it('Step 3: Settlement payout is immediately frozen (status = held) by dispute hook', async () => {
    const settlement = await dbHelper.getSettlement(settlementId);
    expect(settlement.status).toBe('held');
  });

  it('Step 4: Admin reviews dispute evidence in admin portal via GET /api/admin/disputes', async () => {
    const res = await client.get('/api/admin/disputes', { role: 'admin' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.disputes)).toBe(true);
    const dispute = res.body.disputes.find((d: any) => d.id === disputeId);
    expect(dispute).toBeDefined();
    expect(dispute.description).toContain('cold');
  });

  it('Step 5: Admin issues resolution refund_customer granting 25% refund (₹30,000) via POST /api/admin/disputes/:id/resolve', async () => {
    const refundAmountPaise = 3000000;
    const res = await client.post(
      `/api/admin/disputes/${disputeId}/resolve`,
      {
        resolution: 'refund_customer',
        resolutionNotes: 'Verified customer complaints with photos. 25% refund approved.',
        refundPaise: refundAmountPaise,
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body.dispute.status).toBe('resolved');
    expect(res.body.dispute.resolution).toBe('refund_customer');

    const dispute = await dbHelper.getDisputeById(disputeId);
    expect(dispute.status).toBe('resolved');
    expect(dispute.resolution).toBe('refund_customer');
    expect(dispute.refund_amount_paise).toBe(3000000);
  });

  it('Step 6: Customer refund is processed; settlement hold released with adjusted net payout', async () => {
    const updatedSettlement = await dbHelper.getSettlement(settlementId);
    expect(updatedSettlement.status).toBe('pending');
    expect(updatedSettlement.net_payout_paise).toBe(10800000 - 3000000);
  });
});
