import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { signInternalToken } from '@caterconnect/shared';
import { buildPaymentServer } from '../src';
import { pgPool } from '../src/db';

describe('Payment Service Integration (Dual Options & Webhook)', () => {
  const app = buildPaymentServer();
  const testCustomerId = 'c0000000-0000-0000-0000-000000000001';
  const testCatererId = 'd0000000-0000-0000-0000-000000000001';
  const testBookingId = 'f0000000-0000-0000-0000-000000000001';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_vitest_hmac';
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
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001',
        'x-user-role': 'customer',
      },
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
      headers: {
        'x-user-id': 'admin-uuid-0001',
        'x-user-role': 'admin',
      },
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
      headers: {
        'x-user-id': 'admin-uuid-0001',
        'x-user-role': 'admin',
      },
    });
    expect(histRes.statusCode).toBe(200);
    const hist = histRes.json();
    expect(hist.summary.totalGrossPaise).toBeGreaterThanOrEqual(100000);
    expect(hist.summary.pendingDisbursementPaise).toBeGreaterThanOrEqual(85000);

    // 3. Admin disburses payout with bank UTR reference
    const disburseRes = await app.inject({
      method: 'POST',
      url: `/api/payments/settlements/${settlement.id}/disburse`,
      headers: {
        'x-user-id': 'admin-uuid-0001',
        'x-user-role': 'admin',
      },
      payload: {
        utrReference: 'UTR_HDFC_20261104_998877',
      },
    });
    expect(disburseRes.statusCode).toBe(200);
    expect(disburseRes.json().settlement.status).toBe('settled');
    expect(disburseRes.json().settlement.utr_reference).toBe('UTR_HDFC_20261104_998877');

    // Verify P0-27: Admin audit log entry was created
    const auditRes = await pgPool.query(
      `SELECT * FROM audit_svc.admin_audit_logs WHERE action = 'disburse_settlement' AND entity_id = $1`,
      [settlement.id]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.rows[0].admin_id).toBe('admin-uuid-0001');
    expect(auditRes.rows[0].details.utrReference).toBe('UTR_HDFC_20261104_998877');
  });

  it('allows admin to query platform analytics and list settlements', async () => {
    // 1. Admin analytics
    const aRes = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics',
      headers: {
        'x-user-id': 'admin-uuid-0001',
        'x-user-role': 'admin',
      },
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
      headers: {
        'x-user-id': 'admin-uuid-0001',
        'x-user-role': 'admin',
      },
    });
    expect(sRes.statusCode).toBe(200);
    const sBody = sRes.json();
    expect(Array.isArray(sBody.settlements)).toBe(true);
    expect(sBody.settlements.length).toBeGreaterThanOrEqual(1);
    expect(sBody.settlements[0].catererBusinessName).toBeDefined();
  });

  it('verifies client razorpay signature without marking paid (P0-6), then webhook marks booking paid and records 25% advance settlement', async () => {
    const advanceBookingId = 'f0000000-0000-0000-0000-' + Date.now().toString().slice(-12);
    const testCustomerId = 'c0000000-0000-0000-0000-000000000001';
    const testCatererId = 'd0000000-0000-0000-0000-000000000001';
    const testOrderId = `order_test_${Date.now()}`;
    const testPaymentId = `pay_test_${Date.now()}`;
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || 'test_rzp_key_secret_vitest';
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_vitest_hmac';
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_jwt_caterconnect_secure';

    // Insert accepted booking with 100,000 paise (₹1,000)
    await pgPool.query(
      `INSERT INTO order_svc.bookings
       (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status, payment_type, advance_pct)
       VALUES ($1, $2, $3, 'e0000000-0000-0000-0000-000000000001', '2026-12-30', '19:00:00', 50, 'Grand Hall', 'Hyderabad', 100000, 'accepted', 'advance', 25)`,
      [advanceBookingId, testCustomerId, testCatererId]
    );

    // Insert payment record for 25% advance (25,000 paise)
    await pgPool.query(
      `INSERT INTO pay_svc.payments
       (booking_id, razorpay_order_id, amount_paise, currency, status, payment_type)
       VALUES ($1, $2, 25000, 'INR', 'created', 'advance')`,
      [advanceBookingId, testOrderId]
    );

    // Generate valid HMAC signature
    const validSignature = crypto
      .createHmac('sha256', razorpaySecret)
      .update(`${testOrderId}|${testPaymentId}`)
      .digest('hex');

    // 1. Test invalid signature rejection
    const badRes = await app.inject({
      method: 'POST',
      url: '/api/payments/verify-signature',
      headers: {
        'x-user-id': testCustomerId,
        'x-user-role': 'customer',
      },
      payload: {
        bookingId: advanceBookingId,
        razorpayOrderId: testOrderId,
        razorpayPaymentId: testPaymentId,
        razorpaySignature: 'invalid_signature_hash',
      },
    });
    expect(badRes.statusCode).toBe(400);
    expect(badRes.json().error).toContain('Invalid Razorpay payment signature');

    // 2. Test valid signature verification - P0-6: Browser callback must NEVER transition status to paid
    const goodRes = await app.inject({
      method: 'POST',
      url: '/api/payments/verify-signature',
      headers: {
        'x-user-id': testCustomerId,
        'x-user-role': 'customer',
      },
      payload: {
        bookingId: advanceBookingId,
        razorpayOrderId: testOrderId,
        razorpayPaymentId: testPaymentId,
        razorpaySignature: validSignature,
      },
    });
    expect(goodRes.statusCode).toBe(200);
    expect(goodRes.json().success).toBe(true);
    expect(goodRes.json().verified).toBe(true);

    // Verify booking database state remains 'accepted' (NOT 'paid' yet)
    const pendingCheck = await pgPool.query(
      'SELECT status FROM order_svc.bookings WHERE id = $1',
      [advanceBookingId]
    );
    expect(pendingCheck.rows[0].status).toBe('accepted');

    // 3. Send verified Razorpay webhook event (order.paid)
    const webhookPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: testPaymentId,
            order_id: testOrderId,
            amount: 25000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const webhookSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookPayload)
      .digest('hex');

    const hookRes = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': webhookSignature,
      },
      payload: webhookPayload,
    });
    expect(hookRes.statusCode).toBe(200);

    // 4. Verify booking database state after webhook: paid, paid_amount = 25000, balance_due = 75000
    const bCheck = await pgPool.query(
      'SELECT status, amount_paid_paise, balance_due_paise FROM order_svc.bookings WHERE id = $1',
      [advanceBookingId]
    );
    expect(bCheck.rows[0].status).toBe('paid');
    expect(bCheck.rows[0].amount_paid_paise).toBe(25000);
    expect(bCheck.rows[0].balance_due_paise).toBe(75000);

    // 5. Verify settlement breakdown:
    // Total order: 100,000 paise
    // Gross collected online: 25,000 paise (25%)
    // Platform commission: 15,000 paise (15% of total order)
    // Net payout to caterer: 10,000 paise (remaining 10% of advance)
    const sCheck = await pgPool.query(
      'SELECT * FROM pay_svc.caterer_settlements WHERE booking_id = $1',
      [advanceBookingId]
    );
    expect(sCheck.rows.length).toBe(1);
    expect(sCheck.rows[0].gross_amount_paise).toBe(25000);
    expect(sCheck.rows[0].commission_amount_paise).toBe(15000);
    expect(sCheck.rows[0].net_payout_paise).toBe(10000);

    // 6. Test P0-10: /api/payments/internal/refund access control
    // Unauthenticated caller is rejected with 403
    const unauthRefund = await app.inject({
      method: 'POST',
      url: '/api/payments/internal/refund',
      payload: {
        bookingId: advanceBookingId,
        refundAmountPaise: 25000,
        reason: 'Unauthorized refund test',
      },
    });
    expect(unauthRefund.statusCode).toBe(403);

    // Customer role is rejected with 403
    const custRefund = await app.inject({
      method: 'POST',
      url: '/api/payments/internal/refund',
      headers: {
        'x-user-id': testCustomerId,
        'x-user-role': 'customer',
      },
      payload: {
        bookingId: advanceBookingId,
        refundAmountPaise: 25000,
        reason: 'Customer trying refund',
      },
    });
    expect(custRefund.statusCode).toBe(403);

    // Internal service with signed token succeeds
    const internalToken = signInternalToken(
      { userId: 'booking-order-service', role: 'admin' },
      jwtSecret
    );
    const authRefund = await app.inject({
      method: 'POST',
      url: '/api/payments/internal/refund',
      headers: {
        'x-internal-token': internalToken,
      },
      payload: {
        bookingId: advanceBookingId,
        refundAmountPaise: 25000,
        reason: 'Cancellation refund',
      },
    });
    expect(authRefund.statusCode).toBe(200);
    expect(authRefund.json().success).toBe(true);

    const refundCheck = await pgPool.query(
      'SELECT refund_id, refund_amount_paise FROM order_svc.bookings WHERE id = $1',
      [advanceBookingId]
    );
    expect(refundCheck.rows[0].refund_id).toBeTruthy();
    expect(refundCheck.rows[0].refund_amount_paise).toBe(25000);
  });

  it('P0-4 & P1-5: Webhook idempotency and dead-lettering in pay_svc.webhook_events', async () => {
    // 1. Create a fresh booking & payment
    const bRes = await pgPool.query(
      `INSERT INTO order_svc.bookings
       (customer_id, caterer_id, status, booking_mode, event_date, event_time, venue_address, guest_count, total_amount_paise, payment_type)
       VALUES ($1, $2, 'accepted', 'instant', CURRENT_DATE + INTERVAL '10 days', '18:00:00', '123 Main Road, Tirupati', 50, 50000, 'full')
       RETURNING id`,
      [testCustomerId, testCatererId]
    );
    const bookingId = bRes.rows[0].id;

    const rzpOrderId = `order_evt_test_${Date.now()}`;
    await pgPool.query(
      `INSERT INTO pay_svc.payments (booking_id, razorpay_order_id, amount_paise, currency, status, payment_type)
       VALUES ($1, $2, 50000, 'INR', 'created', 'full')`,
      [bookingId, rzpOrderId]
    );

    const testEventId = `evt_idemp_${Date.now()}`;
    const webhookPayload = {
      id: testEventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${Date.now()}`,
            order_id: rzpOrderId,
            amount: 50000,
            currency: 'INR',
          },
        },
      },
    };
    const bodyStr = JSON.stringify(webhookPayload);
    const signature = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');

    // First webhook call: should process and commit
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload: bodyStr,
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().received).toBe(true);

    // Verify webhook_events row
    const evCheck1 = await pgPool.query(
      'SELECT status, attempts FROM pay_svc.webhook_events WHERE event_id = $1',
      [testEventId]
    );
    expect(evCheck1.rows.length).toBe(1);
    expect(evCheck1.rows[0].status).toBe('processed');

    // Replay webhook call with exact same event ID: should return idempotent immediately
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload: bodyStr,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().idempotent).toBe(true);
  });

  it('P0-8: Balance payment order creation and webhook settlement finalization', async () => {
    // 1. Create booking in 'paid' status with remaining balance
    const bRes = await pgPool.query(
      `INSERT INTO order_svc.bookings
       (customer_id, caterer_id, status, booking_mode, event_date, event_time, venue_address, guest_count, total_amount_paise, amount_paid_paise, balance_due_paise, payment_type, advance_pct, advance_paid_at, balance_due_date)
       VALUES ($1, $2, 'paid', 'on_request', CURRENT_DATE + INTERVAL '7 days', '18:00:00', '123 Main Road, Tirupati', 50, 100000, 25000, 75000, 'advance', 25, NOW(), CURRENT_DATE + INTERVAL '5 days')
       RETURNING id`,
      [testCustomerId, testCatererId]
    );
    const bookingId = bRes.rows[0].id;

    // Initial partial settlement entry
    await pgPool.query(
      `INSERT INTO pay_svc.caterer_settlements
       (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status)
       VALUES ($1, $2, 25000, 15.00, 15000, 10000, 'pending')`,
      [bookingId, testCatererId]
    );

    // 2. Customer creates balance payment order
    const balOrderRes = await app.inject({
      method: 'POST',
      url: '/api/payments/create-balance-order',
      headers: {
        'x-user-id': testCustomerId,
        'x-user-role': 'customer',
      },
      payload: { bookingId },
    });
    expect(balOrderRes.statusCode).toBe(201);
    const balOrder = balOrderRes.json();
    expect(balOrder.amountPaise).toBe(75000);
    expect(balOrder.paymentType).toBe('balance');
    expect(balOrder.orderId).toBeTruthy();

    // 3. Webhook arrives for balance payment capture
    const balPaymentId = `pay_bal_${Date.now()}`;
    const balWebhookPayload = {
      id: `evt_bal_${Date.now()}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: balPaymentId,
            order_id: balOrder.orderId,
            amount: 75000,
            currency: 'INR',
          },
        },
      },
    };
    const bodyStr = JSON.stringify(balWebhookPayload);
    const signature = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload: bodyStr,
    });
    expect(webhookRes.statusCode).toBe(200);

    // 4. Verify booking has zero balance due and amount_paid is 100,000 paise
    const bCheck = await pgPool.query(
      'SELECT status, amount_paid_paise, balance_due_paise FROM order_svc.bookings WHERE id = $1',
      [bookingId]
    );
    expect(bCheck.rows[0].status).toBe('paid');
    expect(bCheck.rows[0].amount_paid_paise).toBe(100000);
    expect(bCheck.rows[0].balance_due_paise).toBe(0);

    // 5. Verify settlement updated to full order totals
    const sCheck = await pgPool.query(
      'SELECT * FROM pay_svc.caterer_settlements WHERE booking_id = $1',
      [bookingId]
    );
    expect(sCheck.rows[0].gross_amount_paise).toBe(100000);
    expect(sCheck.rows[0].commission_amount_paise).toBe(15000);
    expect(sCheck.rows[0].net_payout_paise).toBe(85000);
  });
});