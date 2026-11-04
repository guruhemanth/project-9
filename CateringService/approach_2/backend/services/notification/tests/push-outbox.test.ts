import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildNotificationServer } from '../src';
import { pgPool } from '../src/db';
import { NotificationDispatcher } from '../src/dispatcher';
import { OutboxWorker } from '../src/outbox';
import { signInternalToken } from '@caterconnect/shared';

describe('Phase 5 Push Notifications & Outbox Worker (Test-First)', () => {
  const app = buildNotificationServer();
  const testUserId = 'a0000000-0000-0000-0000-000000000099';
  const testEndpoint = `https://fcm.googleapis.com/fcm/send/test-token-${Date.now()}`;

  beforeAll(async () => {
    await app.ready();

    // Ensure a test user exists in auth_svc.users
    await pgPool.query(
      `INSERT INTO auth_svc.users (id, email, password_hash, role, full_name, phone)
       VALUES ($1, 'push.tester@caterconnect.in', 'hash', 'customer', 'Push Tester', '+919876543299')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    // Clean outbox and subscriptions for test idempotency
    await pgPool.query('DELETE FROM notify_svc.notification_outbox');
    await pgPool.query('DELETE FROM notify_svc.push_subscriptions WHERE user_id = $1', [testUserId]);
  });

  afterAll(async () => {
    await app.close();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('rejects push subscription without authentication (401 Unauthorized)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notify/push/subscribe',
      payload: {
        endpoint: testEndpoint,
        keys: { p256dh: 'testKeyP256dh', auth: 'testKeyAuth' },
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('allows authenticated user to register and update Web Push subscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notify/push/subscribe',
      headers: {
        'x-user-id': testUserId,
        'x-user-role': 'customer',
      },
      payload: {
        endpoint: testEndpoint,
        keys: { p256dh: 'testP256dhValue123', auth: 'testAuthValue456' },
        userAgent: 'Mozilla/5.0 Vitest Agent',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.subscription.endpoint).toBe(testEndpoint);

    // Verify database row
    const dbRes = await pgPool.query(
      'SELECT * FROM notify_svc.push_subscriptions WHERE endpoint = $1',
      [testEndpoint]
    );
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].user_id).toBe(testUserId);
  });

  it('processes all event types via Transactional Outbox worker without failing', async () => {
    const dispatcher = new NotificationDispatcher({ mode: 'log' });
    const worker = new OutboxWorker(dispatcher);

    // Seed outbox events for all 7 lifecycle events
    const events = [
      {
        event_type: 'booking_requested',
        payload: {
          bookingId: 'b0000000-0000-0000-0000-000000000001',
          catererOwnerId: testUserId,
          catererPhone: '+919876543299',
          eventDate: '2026-11-20',
        },
      },
      {
        event_type: 'booking_accepted',
        payload: {
          bookingId: 'b0000000-0000-0000-0000-000000000001',
          customerId: testUserId,
          recipientPhone: '+919876543299',
          catererName: 'Annapurna Caterers',
          eventDate: '2026-11-20',
          totalAmountINR: '₹75,000',
        },
      },
      {
        event_type: 'booking_rejected',
        payload: {
          bookingId: 'b0000000-0000-0000-0000-000000000001',
          customerId: testUserId,
          catererName: 'Annapurna Caterers',
          eventDate: '2026-11-20',
        },
      },
      {
        event_type: 'booking_paid',
        payload: {
          bookingId: 'b0000000-0000-0000-0000-000000000001',
          customerId: testUserId,
          catererOwnerId: testUserId,
          eventDate: '2026-11-20',
          amountPaidINR: '₹18,750',
        },
      },
      {
        event_type: 'booking_cancelled',
        payload: {
          bookingId: 'b0000000-0000-0000-0000-000000000001',
          customerId: testUserId,
          catererOwnerId: testUserId,
          eventDate: '2026-11-20',
          refundINR: '₹18,750',
        },
      },
      {
        event_type: 'booking_completed',
        payload: {
          bookingId: 'b0000000-0000-0000-0000-000000000001',
          customerId: testUserId,
          catererName: 'Annapurna Caterers',
          eventDate: '2026-11-20',
        },
      },
      {
        event_type: 'chat_message',
        payload: {
          bookingId: 'b0000000-0000-0000-0000-000000000001',
          recipientId: testUserId,
          senderName: 'Chef Ramesh',
          messagePreview: 'We have finalized the sweet menu items.',
        },
      },
    ];

    for (const ev of events) {
      await pgPool.query(
        'INSERT INTO notify_svc.notification_outbox (event_type, payload) VALUES ($1, $2)',
        [ev.event_type, JSON.stringify(ev.payload)]
      );
    }

    // Run batch processing
    const processedCount = await worker.processBatch(20);
    expect(processedCount).toBe(7);

    // Verify all rows moved to processed status
    const remainingPending = await pgPool.query(
      "SELECT count(*) FROM notify_svc.notification_outbox WHERE status = 'pending'"
    );
    expect(parseInt(remainingPending.rows[0].count, 10)).toBe(0);
  });

  it('allows authenticated user to unsubscribe their device endpoint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notify/push/unsubscribe',
      headers: {
        'x-user-id': testUserId,
        'x-user-role': 'customer',
      },
      payload: {
        endpoint: testEndpoint,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().unsubscribed).toBe(true);

    const checkRes = await pgPool.query(
      'SELECT * FROM notify_svc.push_subscriptions WHERE endpoint = $1',
      [testEndpoint]
    );
    expect(checkRes.rows.length).toBe(0);
  });
});
