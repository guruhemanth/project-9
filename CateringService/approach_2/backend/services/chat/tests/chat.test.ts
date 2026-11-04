import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildChatServer } from '../src';
import { pgPool } from '../src/db';

describe('Chat Service Integration', () => {
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
    expect(res.json()).toEqual({ status: 'ok', service: 'chat-service' });
  });

  it('blocks unauthorized users from creating or viewing chat thread', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/chat/threads/booking/${testBookingId}`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-999999999999', // Unknown user
        'x-user-role': 'customer',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Forbidden');
  });

  it('allows authorized customer to open thread and send messages', async () => {
    // 1. Customer accesses thread
    const threadRes = await app.inject({
      method: 'GET',
      url: `/api/chat/threads/booking/${testBookingId}`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001', // Customer
        'x-user-role': 'customer',
      },
    });

    expect(threadRes.statusCode).toBe(200);
    const thread = threadRes.json().thread;
    expect(thread.id).toBeDefined();
    expect(thread.bookingId).toBe(testBookingId);
    createdThreadId = thread.id;

    // 2. Customer sends message
    const sendRes = await app.inject({
      method: 'POST',
      url: `/api/chat/threads/${createdThreadId}/messages`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001',
        'x-user-role': 'customer',
      },
      payload: {
        message: 'Hello! Can we add extra Tirupati Laddus to the dessert course?',
      },
    });

    expect(sendRes.statusCode).toBe(201);
    expect(sendRes.json().message.message).toContain('Tirupati Laddus');

    // 3. Caterer owner replies
    const replyRes = await app.inject({
      method: 'POST',
      url: `/api/chat/threads/${createdThreadId}/messages`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000002', // Caterer owner
        'x-user-role': 'caterer',
      },
      payload: {
        message: 'Namaste! Yes, absolutely. We will prepare fresh Tirupati laddu prasadam.',
      },
    });

    expect(replyRes.statusCode).toBe(201);

    // 4. Retrieve chronological message history
    const historyRes = await app.inject({
      method: 'GET',
      url: `/api/chat/threads/${createdThreadId}/messages`,
    });

    expect(historyRes.statusCode).toBe(200);
    const msgs = historyRes.json().messages;
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0].senderRole).toBe('customer');
    expect(msgs[1].senderRole).toBe('caterer');
  });
});