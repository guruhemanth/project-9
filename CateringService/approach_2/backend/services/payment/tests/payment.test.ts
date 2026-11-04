import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { buildPaymentServer } from '../src';
import { pgPool } from '../src/db';

describe('Payment Service Integration (Dual Options & Webhook)', () => {
  const app = buildPaymentServer();
  const testBookingId = 'f0000000-0000-0000-0000-000000000001';
  let createdOrderId = '';

  beforeAll(async () => {
    await app.ready();
    // Insert a test booking in 'accepted' state with 100,000 paise (₹1,000)
    await pgPool.query(
      `INSERT INTO order_svc.bookings
       (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-12-25', '18:00:00', 50, 'Tirupati Center', 'Tirupati', 100000, 'accepted')
       ON CONFLICT (id) DO UPDATE SET status = 'accepted', total_amount_paise = 100000`,
      [testBookingId]
    );
  });

  afterAll(async () => {
    await app.close();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('responds with 200 on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'payment-service' });
  });

  it('responds with 200 on /ready when postgres is connected', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('database', 'connected');
  });

  it('creates an advance order (Option 2: 25% Advance lock)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/create-order',
      payload: {
        bookingId: testBookingId,
        paymentOption: 'advance',
        advancePct: 25,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    // 25% of 100,000 paise = 25,000 paise (₹250)
    expect(body.amountPaise).toBe(25000);
    expect(body.currency).toBe('INR');
    expect(body.paymentOption).toBe('advance');
    expect(body.orderId).toBeDefined();
    createdOrderId = body.orderId;
  });

  it('rejects razorpay webhook with invalid HMAC signature', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test', order_id: createdOrderId, amount: 25000 } } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': 'invalid_signature_hash',
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid Razorpay webhook signature');
  });

  it('verifies razorpay webhook with valid HMAC signature and transitions booking to paid with balance tracked', async () => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_vitest_hmac';
    const testPaymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: testPaymentId,
            order_id: createdOrderId,
            amount: 25000,
            status: 'captured',
          },
        },
      },
    });

    const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);

    // Verify idempotency: duplicate webhook delivery is recognized and ignored safely
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });
    expect(dupRes.statusCode).toBe(200);
    expect(dupRes.json().idempotent).toBe(true);

    // Verify database state: booking is 'paid', amount_paid_paise = 25000, balance_due_paise = 75000
    const bCheck = await pgPool.query('SELECT status, amount_paid_paise, balance_due_paise FROM order_svc.bookings WHERE id = $1', [testBookingId]);
    expect(bCheck.rows[0].status).toBe('paid');
    expect(bCheck.rows[0].amount_paid_paise).toBe(25000);
    expect(bCheck.rows[0].balance_due_paise).toBe(75000);
  });

  it('generates a settlement ledger entry with exact 15% commission and net payout in paise', async () => {
    const uniqueBookingId = 'f0000000-0000-0000-0000-' + Date.now().toString().slice(-12);
    await pgPool.query(
      `INSERT INTO order_svc.bookings
       (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-12-28', '18:00:00', 50, 'Tirupati Center', 'Tirupati', 100000, 'completed')`,
      [uniqueBookingId]
    );

    // 1. Generate settlement for the test booking
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/settlements/generate',
      payload: {
        bookingId: uniqueBookingId,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const settlement = body.settlement;
    // Total is 100,000 paise (₹1,000)
    // 15% commission = 15,000 paise (₹150)
    // Net payout = 85,000 paise (₹850)
    expect(settlement.gross_amount_paise).toBe(100000);
    expect(settlement.commission_amount_paise).toBe(15000);
    expect(settlement.net_payout_paise).toBe(85000);
    expect(settlement.status).toBe('pending');
    expect(settlement.gross_amount_paise).toBe(
      settlement.commission_amount_paise + settlement.net_payout_paise
    );

    // 2. Fetch caterer settlement history
    const catererId = 'd0000000-0000-0000-0000-000000000001';
    const histRes = await app.inject({
      method: 'GET',
      url: `/api/payments/settlements/caterer/${catererId}`,
    });
    expect(histRes.statusCode).toBe(200);
    const hist = histRes.json();
    expect(hist.summary.totalGrossPaise).toBeGreaterThanOrEqual(100000);
    expect(hist.summary.pendingDisbursementPaise).toBeGreaterThanOrEqual(85000);

    // 3. Admin disburses payout with bank UTR reference
    const disburseRes = await app.inject({
      method: 'POST',
      url: `/api/payments/settlements/${settlement.id}/disburse`,
      payload: {
        utrReference: 'UTR_HDFC_20261104_998877',
      },
    });
    expect(disburseRes.statusCode).toBe(200);
    expect(disburseRes.json().settlement.status).toBe('settled');
    expect(disburseRes.json().settlement.utr_reference).toBe('UTR_HDFC_20261104_998877');
  });

  it('allows admin to query platform analytics and list settlements', async () => {
    // 1. Admin analytics
    const aRes = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics',
    });
    expect(aRes.statusCode).toBe(200);
    const body = aRes.json();
    expect(body.analytics).toBeDefined();
    expect(typeof body.analytics.totalGMVPaise).toBe('number');
    expect(typeof body.analytics.totalCommissionPaise).toBe('number');
    expect(typeof body.analytics.totalCaterersCount).toBe('number');

    // 2. Admin list settlements
    const sRes = await app.inject({
      method: 'GET',
      url: '/api/admin/settlements',
    });
    expect(sRes.statusCode).toBe(200);
    const sBody = sRes.json();
    expect(Array.isArray(sBody.settlements)).toBe(true);
    expect(sBody.settlements.length).toBeGreaterThanOrEqual(1);
    expect(sBody.settlements[0].catererBusinessName).toBeDefined();
  });
});