import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 3: Customer Dispute ↔ Settlement Hold Interaction', () => {
  const client = createApiClient();
  let testBookingId: string;
  let testSettlementId: string;
  let testDisputeId: string;

  beforeAll(async () => {
    await startAllServers();

    const eventDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Create a mock completed booking with a pending settlement
    const booking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', $3, '18:00:00', 100, '56 Temple Street', 'Tirupati', 'Andhra Pradesh', 10000000, 'completed', 10000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id, eventDate],
    );
    testBookingId = booking[0].id;

    const mockOrderId = `order_mock_t3dsp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mockPaymentId = `pay_mock_t3dsp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await dbHelper.query(
      `INSERT INTO pay_svc.payments 
       (booking_id, amount_paise, currency, status, payment_type, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, 10000000, 'INR', 'captured', 'full', $2, $3)`,
      [testBookingId, mockOrderId, mockPaymentId],
    );

    const settlement = await dbHelper.query(
      `INSERT INTO pay_svc.caterer_settlements 
       (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status, payout_status, payout_mode, retry_count)
       VALUES ($1, $2, 10000000, 0.10, 1000000, 9000000, 'pending', 'pending', 'NEFT', 0)
       RETURNING id`,
      [testBookingId, TEST_CATERER.id],
    );
    testSettlementId = settlement[0].id;
  });

  afterAll(async () => {
    if (testSettlementId) {
      await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE id = $1`, [testSettlementId]);
    }
    if (testDisputeId) {
      await dbHelper.query(`DELETE FROM order_svc.disputes WHERE id = $1`, [testDisputeId]);
    }
    if (testBookingId) {
      await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [testBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.disputes WHERE booking_id = $1`, [testBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [testBookingId]);
    }
    await stopAllServers();
  });

  it('TC-T3-DSP-01: Customer dispute submission immediately transitions caterer settlement status to held', async () => {
    const res = await client.post(
      `/api/bookings/${testBookingId}/disputes`,
      {
        category: 'service_shortage',
        description: 'Main course was insufficient',
        evidenceUrls: ['https://cdn.caterconnect.in/evidence1.jpg'],
        refundRequestedPaise: 2500000,
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.disputeId).toBeDefined();
    testDisputeId = res.body.disputeId;

    const settlement = await dbHelper.getSettlement(testSettlementId);
    expect(settlement.status).toBe('held');
  });

  it('TC-T3-DSP-02: Automated payout engine blocks disbursement while settlement status is held', async () => {
    const res = await client.post(
      `/api/admin/settlements/${testSettlementId}/disburse`,
      { utrReference: 'UTR_TEST_HOLD_BLOCKED' },
      { role: 'admin' },
    );
    expect(res.status).toBe(400);
  });

  it('TC-T3-DSP-03: Admin dispute resolution refund_customer adjusts settlement net_payout_paise and logs refund', async () => {
    const refundAmountPaise = 2500000;
    const res = await client.post(
      `/api/admin/disputes/${testDisputeId}/resolve`,
      {
        resolution: 'refund_customer',
        resolutionNotes: 'Approved 25% shortage refund',
        refundPaise: refundAmountPaise,
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body.dispute.status).toBe('resolved');

    const updatedSettlement = await dbHelper.getSettlement(testSettlementId);
    expect(updatedSettlement.net_payout_paise).toBe(9000000 - refundAmountPaise);
    expect(updatedSettlement.status).toBe('pending');
  });

  it('TC-T3-DSP-04: Admin resolution unfreezes settlement status from held allowing payout engine to resume', async () => {
    const settlement = await dbHelper.getSettlement(testSettlementId);
    expect(settlement.status).not.toBe('held');
    expect(settlement.status).toBe('pending');
  });
});
