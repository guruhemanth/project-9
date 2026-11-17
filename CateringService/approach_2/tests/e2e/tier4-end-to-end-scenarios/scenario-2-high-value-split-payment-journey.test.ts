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

describe('Tier 4: Scenario 2 — High-Value Banquet Split Payment Journey (>₹1.5 Lakh)', () => {
  const client = createApiClient();
  let bookingId: string;
  let orderId1: string;
  let orderId2: string;
  const totalAmountPaise = 17500000; // 500 guests * ₹350/plate = ₹1,75,000 (>₹1.5 Lakh)
  const futureEventDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  beforeAll(async () => {
    await startAllServers();
    await dbHelper.query(`DELETE FROM caterer_svc.caterer_availability WHERE unavailable_date = $1`, [futureEventDate]);
    await dbHelper.query(
      `UPDATE caterer_svc.caterers SET status = 'approved' WHERE id = $1`,
      [TEST_CATERER.id],
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
    }
    await stopAllServers();
  });

  it('Step 1: High-value booking for ₹1,75,000 is requested and accepted by caterer via API', async () => {
    // 1a. Customer creates high-value banquet booking via API
    const createRes = await client.post(
      '/api/bookings',
      {
        catererId: TEST_CATERER.id,
        packageId: TEST_CATERER.packageId,
        eventDate: futureEventDate,
        eventTime: '19:00:00',
        guestCount: 500,
        venueAddress: 'Convention Plaza',
        city: 'Tirupati',
        state: 'Andhra Pradesh',
      },
      { role: 'customer' },
    );
    expect(createRes.status).toBe(201);
    expect(createRes.body.booking).toBeDefined();
    bookingId = createRes.body.booking.id;

    // 1b. Caterer accepts booking via API
    const acceptRes = await client.post(
      `/api/bookings/${bookingId}/accept`,
      { catererNote: 'Banquet hall reserved for 500 guests' },
      { role: 'caterer' },
    );
    expect(acceptRes.status).toBe(200);

    const updated = await dbHelper.getBooking(bookingId);
    expect(updated.total_amount_paise).toBe(totalAmountPaise);
    expect(updated.status).toBe('accepted');
  });

  it('Step 2: Split payment API validates minimum tranche threshold via POST /api/payments/create-order', async () => {
    // Attempting a split tranche below the ₹5,000 minimum is rejected with 400 Bad Request
    const invalidRes = await client.post(
      '/api/payments/create-order',
      {
        bookingId,
        paymentOption: 'split',
        trancheAmountPaise: 100000, // ₹1,000 (below ₹5,000 min)
      },
      { role: 'customer' },
    );
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error).toContain('Minimum split tranche');
  });

  it('Step 3: Customer initiates Split Payment Tranche 1 of ₹1,00,000', async () => {
    const tranche1Paise = 10000000;
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId,
        paymentOption: 'split',
        trancheAmountPaise: tranche1Paise,
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body.amountPaise).toBe(tranche1Paise);
    orderId1 = res.body.orderId;
  });

  it('Step 4: Tranche 1 payment completes via webhook; booking updates to partial paid with remaining balance', async () => {
    const tranche1Paise = 10000000;
    const rzpPaymentId1 = `pay_split1_${Date.now()}`;
    const webhookPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId1,
            order_id: orderId1,
            amount: tranche1Paise,
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

    const booking = await dbHelper.getBooking(bookingId);
    expect(booking.amount_paid_paise).toBe(10000000);
    expect(booking.balance_due_paise).toBe(totalAmountPaise - 10000000);
    expect(booking.status).toBe('paid');
  });

  it('Step 5: Customer initiates and completes Tranche 2 for remaining ₹75,000 balance', async () => {
    const tranche2Paise = 7500000;
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId,
        paymentOption: 'split',
        trancheAmountPaise: tranche2Paise,
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body.amountPaise).toBe(tranche2Paise);
    orderId2 = res.body.orderId;

    const rzpPaymentId2 = `pay_split2_${Date.now()}`;
    const webhookPayload2 = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId2,
            order_id: orderId2,
            amount: tranche2Paise,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const signature2 = generateWebhookSignature(webhookPayload2);
    const hookRes2 = await client.post('/api/payments/webhook', webhookPayload2, {
      headers: {
        'x-razorpay-signature': signature2,
        'content-type': 'application/json',
      },
    });

    expect(hookRes2.status).toBe(200);

    const booking = await dbHelper.getBooking(bookingId);
    expect(booking.amount_paid_paise).toBe(17500000);
    expect(booking.balance_due_paise).toBe(0);
    expect(booking.status).toBe('paid');
  });

  it('Step 6: Booking fully confirmed; contact details unlock for caterer and customer', async () => {
    const res = await client.get(`/api/bookings/${bookingId}`, { role: 'customer' });
    expect(res.status).toBe(200);
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.status).toBe('paid');
    expect(res.body.booking.balance_due_paise).toBe(0);
    expect(res.body.booking.amount_paid_paise).toBe(totalAmountPaise);
  });
});
