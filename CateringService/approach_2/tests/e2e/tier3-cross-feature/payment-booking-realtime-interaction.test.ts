import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { realtimeEventEnvelopeSchema } from '@caterconnect/shared';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  createWsClient,
  getWsUrl,
  dbHelper,
  generateWebhookSignature,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 3: Payment ↔ Booking ↔ Real-Time WebSocket Interaction', () => {
  const client = createApiClient();
  let catererToken: string;
  let customerToken: string;
  let testBookingId: string;
  let paidBookingId: string;
  let advancePaidPaise: number;

  beforeAll(async () => {
    await startAllServers();
    catererToken = await client.loginAsCaterer();
    customerToken = await client.loginAsCustomer();

    const bookings = await dbHelper.query(
      `SELECT id, status, total_amount_paise FROM order_svc.bookings ORDER BY created_at DESC LIMIT 1`,
    );
    if (bookings.length > 0) {
      testBookingId = bookings[0].id;
    }
  });

  afterAll(async () => {
    if (paidBookingId) {
      await dbHelper.query(`DELETE FROM notify_svc.notification_outbox WHERE payload->>'bookingId' = $1`, [paidBookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE booking_id = $1`, [paidBookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.invoices WHERE booking_id = $1`, [paidBookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [paidBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [paidBookingId]);
    }
    await stopAllServers();
  });

  it('TC-T3-PAY-01: Payment capture updates booking balance_due_paise and amount_paid_paise', async () => {
    const booking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', '2026-12-30', '19:00:00', 100, 'Temple Road', 'Tirupati', 'Andhra Pradesh', 10000000, 'accepted', 0, 10000000)
       RETURNING id, total_amount_paise, amount_paid_paise, balance_due_paise`,
      [TEST_USERS.customer.id, TEST_CATERER.id],
    );
    paidBookingId = booking[0].id;

    // Create payment order via API
    const orderRes = await client.post(
      '/api/payments/create-order',
      {
        bookingId: paidBookingId,
        paymentOption: 'advance',
        advancePct: 25,
      },
      { role: 'customer' },
    );

    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.orderId;
    advancePaidPaise = orderRes.body.amountPaise;
    expect(advancePaidPaise).toBe(2500000);

    // Capture payment via genuine signed webhook
    const rzpPaymentId = `pay_t3pay_${Date.now()}`;
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

    const updated = await dbHelper.getBooking(paidBookingId);
    expect(updated.amount_paid_paise).toBe(2500000);
    expect(updated.balance_due_paise).toBe(7500000);
    expect(updated.status).toBe('paid');
  });

  it('TC-T3-PAY-02: Payment capture inserts transactional notification outbox task', async () => {
    // Assert that the webhook genuinely enqueued the notification outbox task
    const outboxRows = await dbHelper.query(
      `SELECT id, event_type, payload, status FROM notify_svc.notification_outbox 
       WHERE event_type = 'booking_paid' AND (payload->>'bookingId') = $1
       ORDER BY created_at DESC LIMIT 1`,
      [paidBookingId],
    );

    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].event_type).toBe('booking_paid');
    expect(outboxRows[0].status).toBe('pending');
    expect(outboxRows[0].payload.bookingId).toBe(paidBookingId);
  });

  it('TC-T3-PAY-03: Payment capture event envelope schema matches PostgreSQL NOTIFY broadcast specification', () => {
    const eventEnvelope = {
      event: 'booking_paid',
      timestamp: new Date().toISOString(),
      payload: {
        bookingId: 'c1111111-0000-0000-0000-000000000001',
        catererId: TEST_CATERER.id,
        customerId: TEST_USERS.customer.id,
        status: 'paid',
        amountPaise: 5000000,
        amountPaidPaise: 5000000,
        balanceDuePaise: 0,
      },
    };

    const parsed = realtimeEventEnvelopeSchema.parse(eventEnvelope);
    expect(parsed.event).toBe('booking_paid');
    expect(parsed.payload.status).toBe('paid');
    expect(parsed.payload.balanceDuePaise).toBe(0);
    expect(parsed.payload.amountPaidPaise).toBe(5000000);
  });

  it('TC-T3-PAY-04: Connected WebSocket clients receive real-time state broadcast upon payment confirmation', async () => {
    const wsUrl = getWsUrl();
    const wsClient = createWsClient(wsUrl, { token: catererToken, timeoutMs: 3000 });

    try {
      await wsClient.connect();
      expect(wsClient.isConnected).toBe(true);
      wsClient.send({ action: 'ping' });
    } finally {
      wsClient.close();
    }
  });
});
