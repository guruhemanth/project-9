import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildBookingServer } from '../src';
import { pgPool } from '../src/db';

describe('Booking Order Service Authorization Holes (Test-First)', () => {
  const app = buildBookingServer();
  const testBookingId = 'b0000000-0000-0000-0000-000000000088';

  beforeAll(async () => {
    await app.ready();
    await pgPool.query(`
      INSERT INTO order_svc.bookings (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
      VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-12-05', '12:00', 50, 'Test Venue', 'Tirupati', 2500000, 'requested')
      ON CONFLICT (id) DO UPDATE SET status = 'requested'
    `, [testBookingId]);
  });

  afterAll(async () => {
    await app.close();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('FAIL: non-owner caterer cannot accept a booking', async () => {
    // F4: POST /api/bookings/:id/accept with caterer B actor for caterer A booking
    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${testBookingId}/accept`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000009', // Random non-owner user
        'x-user-role': 'caterer',
      },
    });
    // This MUST return 403 Forbidden
    expect(res.statusCode).toBe(403);
  });

  it('FAIL: non-owner customer cannot cancel another customers booking', async () => {
    // F4: POST /api/bookings/:id/cancel with customer B actor for customer A booking
    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${testBookingId}/cancel`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000009', // Random other customer
        'x-user-role': 'customer',
      },
      payload: { reason: 'Unauthorized cancellation' },
    });
    // This MUST return 403 Forbidden
    expect(res.statusCode).toBe(403);
  });
});
