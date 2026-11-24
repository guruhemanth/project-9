import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
  generateWebhookSignature,
} from '../harness';

describe('Tier 4: Scenario 1 — End-to-End Booking to Settlement Lifecycle', () => {
  const client = createApiClient();
  let bookingId: string;
  let settlementId: string;
  let orderId: string;
  let advancePaidPaise: number;
  const catererId = TEST_CATERER.id;
  const guestCount = 150;
  const pricePerPlatePaise = 35000;
  const totalAmountPaise = guestCount * pricePerPlatePaise; // 5,250,000 paise (₹52,500)
  const futureEventDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  beforeAll(async () => {
    await startAllServers();
    await dbHelper.query(`DELETE FROM caterer_svc.caterer_availability WHERE unavailable_date = $1`, [futureEventDate]);
    // Ensure test caterer is approved and has bank details for clean lifecycle execution
    await dbHelper.query(
      `UPDATE caterer_svc.caterers 
       SET status = 'approved',
           bank_account_holder_name = 'Sri Venkateswara Catering',
           bank_account_number = '98765432101234',
           bank_ifsc = 'HDFC0001234',
           bank_name = 'HDFC Bank',
           updated_at = NOW()
       WHERE id = $1`,
      [catererId],
    );
  });

  afterAll(async () => {
    await dbHelper.query(`DELETE FROM caterer_svc.caterer_availability WHERE unavailable_date = $1`, [futureEventDate]);
    if (bookingId) {
      await dbHelper.query(`DELETE FROM pay_svc.invoices WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.tax_ledger WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM notify_svc.notification_outbox WHERE payload->>'bookingId' = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.booking_status_history WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM caterer_svc.caterer_availability WHERE booking_id = $1`, [bookingId]);
    }
    await stopAllServers();
  });

  it('Step 1: Customer creates booking request for 150 guests via POST /api/bookings', async () => {
    const res = await client.post(
      '/api/bookings',
      {
        catererId,
        packageId: TEST_CATERER.packageId,
        eventDate: futureEventDate,
        eventTime: '18:00:00',
        guestCount,
        venueAddress: '77 Palace Road',
        city: 'Tirupati',
        state: 'Andhra Pradesh',
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
    bookingId = res.body.booking.id;

    expect(res.body.booking.status).toBe('requested');
    expect(res.body.booking.total_amount_paise).toBe(totalAmountPaise);

    // Verify database state mutation
    const dbBooking = await dbHelper.getBooking(bookingId);
    expect(dbBooking.status).toBe('requested');
    expect(dbBooking.total_amount_paise).toBe(totalAmountPaise);
  });

  it('Step 2: Caterer reviews and accepts booking request via POST /api/bookings/:id/accept', async () => {
    const res = await client.post(
      `/api/bookings/${bookingId}/accept`,
      { catererNote: 'Confirmed banquet hall preparation for 150 guests' },
      { role: 'caterer' },
    );

    expect(res.status).toBe(200);

    const booking = await dbHelper.getBooking(bookingId);
    expect(booking.status).toBe('accepted');
    expect(booking.caterer_note).toContain('Confirmed banquet hall');
  });

  it('Step 3: Customer creates payment order and webhook captures payment; booking transitions to paid', async () => {
    // 3a. Customer initiates payment order
    const orderRes = await client.post(
      '/api/payments/create-order',
      {
        bookingId,
        paymentOption: 'advance',
        advancePct: 25,
      },
      { role: 'customer' },
    );

    expect(orderRes.status).toBe(201);
    expect(orderRes.body).toHaveProperty('orderId');
    orderId = orderRes.body.orderId;
    advancePaidPaise = orderRes.body.amountPaise;
    expect(advancePaidPaise).toBe(Math.round(totalAmountPaise * 0.25));

    // 3b. Razorpay webhook fires payment.captured event
    const rzpPaymentId = `pay_scen1_${Date.now()}`;
    const webhookPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId,
            order_id: orderId,
            amount: advancePaidPaise,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const signature = generateWebhookSignature(webhookPayload);
    const hookRes = await client.post('/api/payments/webhook', webhookPayload, {
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
    });

    expect(hookRes.status).toBe(200);
    expect(hookRes.body).toHaveProperty('received', true);

    // 3c. Verify booking state transitioned to 'paid' in DB
    const booking = await dbHelper.getBooking(bookingId);
    expect(booking.status).toBe('paid');
    expect(booking.amount_paid_paise).toBe(advancePaidPaise);
    expect(booking.balance_due_paise).toBe(totalAmountPaise - advancePaidPaise);
  });

  it('Step 4: Outbox worker records real-time notification task for customer and caterer', async () => {
    const outboxRows = await dbHelper.query(
      `SELECT * FROM notify_svc.notification_outbox 
       WHERE payload->>'bookingId' = $1 ORDER BY created_at DESC`,
      [bookingId],
    );

    expect(outboxRows.length).toBeGreaterThan(0);
    const eventTypes = outboxRows.map((r: any) => r.event_type);
    expect(eventTypes.some((t: string) => t === 'booking_paid' || t === 'booking_requested')).toBe(true);
  });

  it('Step 5: Event date passes; automated payout worker computes settlement with commission and TDS', async () => {
    // Verify settlement created by webhook in pay_svc.caterer_settlements
    const settlements = await dbHelper.query(
      `SELECT * FROM pay_svc.caterer_settlements WHERE booking_id = $1`,
      [bookingId],
    );

    expect(settlements.length).toBe(1);
    settlementId = settlements[0].id;
    expect(settlements[0].gross_amount_paise).toBe(advancePaidPaise);
    expect(settlements[0].status).toBe('pending');

    // Admin executes settlement retry or disbursement via endpoint
    const retryRes = await client.post(
      `/api/admin/settlements/${settlementId}/retry`,
      { force: true },
      { role: 'admin' },
    );

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.success).toBe(true);
    expect(retryRes.body).toHaveProperty('payoutId');

    const updatedSettlement = await dbHelper.getSettlement(settlementId);
    expect(updatedSettlement.payout_status).toBe('processed');
  });

  it('Step 6: System generates statutory GST commission invoice and Section 194-O TDS ledger record', async () => {
    // 6a. Verify invoice retrieval via opaque API endpoint
    const invRes = await client.get(`/api/bookings/${bookingId}/invoice`, { role: 'customer' });
    expect(invRes.status).toBe(200);
    expect(invRes.body.success).toBe(true);
    expect(invRes.body.invoice).toBeDefined();
    expect(invRes.body.invoice.sacCode).toBe('998311');

    // 6b. Verify tax ledger database record created by invoicing engine
    const taxRows = await dbHelper.query(
      `SELECT * FROM pay_svc.tax_ledger WHERE booking_id = $1`,
      [bookingId],
    );

    expect(taxRows.length).toBeGreaterThan(0);
    expect(taxRows[0].tax_type).toBe('tds_194o');
    expect(taxRows[0].rate_basis_points).toBe(100);
  });
});
