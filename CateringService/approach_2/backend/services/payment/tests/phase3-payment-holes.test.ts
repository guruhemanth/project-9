import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { buildPaymentServer } from '../src';
import { pgPool } from '../src/db';

describe('Phase 3 Payments & Money Security Holes (Test-First)', () => {
  const app = buildPaymentServer();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_vitest_hmac';
  const testOrderId = `order_test_${Date.now()}`;
  const testBookingId = 'f0000000-0000-0000-0000-111122223333';

  beforeAll(async () => {
    await app.ready();
    // Insert test booking and payment
    await pgPool.query(
      `INSERT INTO order_svc.bookings
       (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-12-30', '18:00:00', 50, 'Tirupati Center', 'Tirupati', 100000, 'accepted')
       ON CONFLICT (id) DO NOTHING`,
      [testBookingId]
    );

    await pgPool.query(
      `INSERT INTO pay_svc.payments
       (booking_id, razorpay_order_id, amount_paise, currency, status, payment_type)
       VALUES ($1, $2, 25000, 'INR', 'created', 'advance')
       ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [testBookingId, testOrderId]
    );
  });

  afterAll(async () => {
    await app.close();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('verifies webhook HMAC signature correctly over raw body even with formatting/whitespace', async () => {
    // Exact payload with multi-line indentation and spacing
    const payload = JSON.stringify(
      {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_whitespace_${Date.now()}`,
              order_id: testOrderId,
              amount: 25000,
              status: 'captured',
            },
          },
        },
      },
      null,
      2 // 2 spaces formatting!
    );

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

    // Should succeed with 200 because HMAC must be computed over RAW body, not re-stringified JSON
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  it('rejects webhook payment when entity.amount does not match order amount', async () => {
    const mismatchOrderId = `order_mismatch_${Date.now()}`;
    await pgPool.query(
      `INSERT INTO pay_svc.payments
       (booking_id, razorpay_order_id, amount_paise, currency, status, payment_type)
       VALUES ($1, $2, 50000, 'INR', 'created', 'advance')`,
      [testBookingId, mismatchOrderId]
    );

    // Attacker sends amount = 100 paise instead of expected 50000 paise
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_mismatch_${Date.now()}`,
            order_id: mismatchOrderId,
            amount: 100, // MISMATCH! Expected 50000!
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

    // Must be rejected with 400 Bad Request
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('mismatch');
  });

  it('ensures replayed webhook does not move completed booking back to paid', async () => {
    const completedBookingId = 'f0000000-0000-0000-0000-999988887777';
    const completedOrderId = `order_completed_${Date.now()}`;

    await pgPool.query(
      `INSERT INTO order_svc.bookings
       (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-11-01', '12:00:00', 50, 'Tirupati Center', 'Tirupati', 100000, 'completed')
       ON CONFLICT (id) DO UPDATE SET status = 'completed'`,
      [completedBookingId]
    );

    await pgPool.query(
      `INSERT INTO pay_svc.payments
       (booking_id, razorpay_order_id, amount_paise, currency, status, payment_type)
       VALUES ($1, $2, 25000, 'INR', 'created', 'advance')
       ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [completedBookingId, completedOrderId]
    );

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_completed_replay_${Date.now()}`,
            order_id: completedOrderId,
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

    // Verify booking status was NOT reverted to 'paid'
    const bCheck = await pgPool.query('SELECT status FROM order_svc.bookings WHERE id = $1', [completedBookingId]);
    expect(bCheck.rows[0].status).toBe('completed');
  });

  it('ensures settlement generation respects custom caterer commission_pct', async () => {
    const customCatererId = 'd0000000-0000-0000-0000-000000000002';
    // Set caterer's commission to 10.00%
    await pgPool.query(
      `INSERT INTO caterer_svc.caterers 
       (id, owner_id, business_name, fssai_number, status, commission_pct)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000099', 'Custom Rate Caterer', '12345678901234', 'approved', 10.00)
       ON CONFLICT (id) DO UPDATE SET commission_pct = 10.00`,
      [customCatererId]
    );

    const bookingId = 'f0000000-0000-0000-0000-555544443333';
    await pgPool.query(
      `INSERT INTO order_svc.bookings
       (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000001', $2, 'e0000000-0000-0000-0000-000000000001', '2026-12-30', '18:00:00', 50, 'Tirupati Center', 'Tirupati', 100000, 'completed')
       ON CONFLICT (id) DO UPDATE SET total_amount_paise = 100000, status = 'completed', caterer_id = $2`,
      [bookingId, customCatererId]
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/settlements/generate',
      headers: {
        'x-user-id': 'admin-uuid-0001',
        'x-user-role': 'admin',
      },
      payload: {
        bookingId,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const settlement = body.settlement;
    // Total is 100,000 paise (₹1,000)
    // 10% dynamic commission = 10,000 paise (not hardcoded 15% / 15,000 paise)
    // Net payout = 90,000 paise
    expect(Number(settlement.commission_pct)).toBe(10);
    expect(settlement.commission_amount_paise).toBe(10000);
    expect(settlement.net_payout_paise).toBe(90000);
  });
});
