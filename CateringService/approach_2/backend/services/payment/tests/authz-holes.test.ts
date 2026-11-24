import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildPaymentServer } from '../src';
import { pgPool } from '../src/db';

describe('Payment Service Authorization Holes (Test-First)', () => {
  const app = buildPaymentServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
    await app.close();
  });

  it('FAIL: non-customer cannot initiate order payment for another users booking', async () => {
    // Seed a booking for customer A
    const bId = 'b0000000-0000-0000-0000-000000000077';
    await pgPool.query(`
      INSERT INTO order_svc.bookings (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
      VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-12-01', '12:00', 50, 'Test Venue', 'Tirupati', 2500000, 'accepted')
      ON CONFLICT (id) DO NOTHING
    `, [bId]);

    // Customer B attempts to create order for customer A's booking
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/create-order',
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000009', // Customer B
        'x-user-role': 'customer',
      },
      payload: {
        bookingId: bId,
        paymentOption: 'full',
      },
    });

    expect(res.statusCode).toBe(403);
  });
});
