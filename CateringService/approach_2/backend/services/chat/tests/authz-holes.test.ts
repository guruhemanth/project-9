import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildChatServer } from '../src';
import { pgPool } from '../src/db';

describe('Chat Service Authorization Holes (Test-First)', () => {
  const app = buildChatServer();
  const testBookingId = 'f0000000-0000-0000-0000-000000000001';
  let createdThreadId = '';

  beforeAll(async () => {
    await app.ready();
    await pgPool.query(
      `INSERT INTO order_svc.bookings (id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, total_amount_paise, status)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-11-20', '12:00:00', 100, 'Tirupati Hall', 'Tirupati', 3500000, 'accepted')
       ON CONFLICT (id) DO NOTHING`,
      [testBookingId]
    );
    const tRes = await pgPool.query(
      `INSERT INTO chat_svc.chat_threads (booking_id, customer_id, caterer_id)
       VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001')
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING id`,
      [testBookingId]
    );
    if (tRes.rows.length > 0) {
      createdThreadId = tRes.rows[0].id;
    } else {
      const q = await pgPool.query('SELECT id FROM chat_svc.chat_threads WHERE booking_id = $1', [testBookingId]);
      createdThreadId = q.rows[0].id;
    }
  });

  afterAll(async () => {
    await app.close();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('FAIL: non-participant user cannot read messages in thread', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/chat/threads/${createdThreadId}/messages`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-999999999999',
        'x-user-role': 'customer',
      },
    });
    // This currently succeeds with 200 because there is no membership check on messages endpoint!
    // It MUST return 403 Forbidden!
    expect(res.statusCode).toBe(403);
  });
});
