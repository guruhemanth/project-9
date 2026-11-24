import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper } from '../harness';

describe('Feature 10: Outbox Reminders & Provider Hooks (P1-11)', () => {
  const client = createApiClient();
  let sampleBookingId: string;

  beforeAll(async () => {
    await startAllServers();
    const rows = await dbHelper.query(
      `SELECT id FROM order_svc.bookings ORDER BY created_at DESC LIMIT 1`,
    );
    if (rows.length > 0) {
      sampleBookingId = rows[0].id;
    }
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-11-01: Reminders sent schema tracks dispatched booking reminders with unique constraint', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'notify_svc' AND table_name = 'reminders_sent'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('booking_id');
    expect(colNames).toContain('reminder_type');
    expect(colNames).toContain('channel');
    expect(colNames).toContain('sent_at');
    expect(colNames).toContain('payload');
  });

  it('TC-P1-11-02: Unique constraint on (booking_id, reminder_type) prevents duplicate reminders', async () => {
    if (!sampleBookingId) return;

    const testReminderType = `event_t24h_test_${Date.now()}`;

    // First insert succeeds
    await dbHelper.query(
      `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel)
       VALUES ($1, $2, 'whatsapp')`,
      [sampleBookingId, testReminderType],
    );

    // Second insert with exact same booking_id and reminder_type must fail unique constraint
    let caughtError = false;
    try {
      await dbHelper.query(
        `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel)
         VALUES ($1, $2, 'sms')`,
        [sampleBookingId, testReminderType],
      );
    } catch {
      caughtError = true;
    }
    expect(caughtError).toBe(true);

    // Clean up
    await dbHelper.query(
      `DELETE FROM notify_svc.reminders_sent WHERE booking_id = $1 AND reminder_type = $2`,
      [sampleBookingId, testReminderType],
    );
  });

  it('TC-P1-11-03: Reminder sweep endpoint triggers upcoming event and payment reminder scan', async () => {
    const res = await client.post('/api/notify/reminders/sweep', {}, { role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('TC-P1-11-04: Notification outbox worker processes pending outbox notifications', async () => {
    const res = await client.post('/api/notify/outbox/process', {}, { role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('TC-P1-11-05: Channel constraint enforces valid delivery channels', async () => {
    if (!sampleBookingId) return;

    let caughtError = false;
    try {
      await dbHelper.query(
        `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel)
         VALUES ($1, 'test_invalid_channel', 'invalid_channel')`,
        [sampleBookingId],
      );
    } catch {
      caughtError = true;
    }
    expect(caughtError).toBe(true);
  });

  it('TC-P1-11-06: Outbox table retains transactional delivery events with retry tracking', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'notify_svc' AND table_name = 'notification_outbox'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('event_type');
    expect(colNames).toContain('status');
    expect(colNames).toContain('retry_count');
    expect(colNames).toContain('payload');
  });
});
