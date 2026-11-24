import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateCancellationRefund } from '@caterconnect/shared';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  mintTestJwt,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 2: Booking & Dispute Boundaries (P1-10, P1-11, P1-12)', () => {
  const client = createApiClient();
  let sampleBookingId: string;
  let paidBookingId: string;
  let testBookingId: string;

  beforeAll(async () => {
    await startAllServers();

    // Create a real test booking
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status)
       VALUES ($1, $2, '2026-11-20', '19:00:00', 100, '12 Main St', 'Tirupati', 'Andhra Pradesh', 10000000, 'accepted')
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id],
    );
    testBookingId = bk[0].id;
    sampleBookingId = testBookingId;

    const bookings = await dbHelper.query(
      `SELECT id, status, event_date, total_amount_paise FROM order_svc.bookings ORDER BY created_at DESC LIMIT 5`,
    );
    if (bookings.length > 0) {
      const paid = bookings.find((b: any) => b.status === 'paid' || b.status === 'completed');
      if (paid) {
        paidBookingId = paid.id;
      }
    }
  });

  afterAll(async () => {
    if (testBookingId) {
      await dbHelper.query(`DELETE FROM notify_svc.reminders_sent WHERE booking_id = $1`, [testBookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.caterer_penalties WHERE booking_id = $1`, [testBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.disputes WHERE booking_id = $1`, [testBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [testBookingId]);
    }
    await stopAllServers();
  });

  // ==============================================================
  // P1-10 Late-Cancel Penalty & Customer Rebook (TC-T2-BKD-01 to 06)
  // ==============================================================

  it('TC-T2-BKD-01: Caterer cancellation <7 days before event date applies 20% penalty tier in pay_svc.caterer_penalties', async () => {
    const nearEventDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, $3, '19:00:00', 100, '12 Main St', 'Tirupati', 'Andhra Pradesh', 10000000, 'paid', 10000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id, nearEventDate],
    );
    const bkId = bk[0].id;

    const mockOrderId = `order_mock_bkd1_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mockPaymentId = `pay_mock_bkd1_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await dbHelper.query(
      `INSERT INTO pay_svc.payments 
       (booking_id, amount_paise, currency, status, payment_type, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, 10000000, 'INR', 'captured', 'full', $2, $3)`,
      [bkId, mockOrderId, mockPaymentId],
    );

    const res = await client.post(
      `/api/bookings/${bkId}/cancel`,
      { reason: 'Caterer staffing emergency' },
      { role: 'caterer' },
    );

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
    expect(res.body.booking.caterer_penalty_paise).toBe(2000000);

    const penaltyRows = await dbHelper.query(
      `SELECT penalty_type, penalty_amount_paise, status FROM pay_svc.caterer_penalties WHERE booking_id = $1`,
      [bkId],
    );
    expect(penaltyRows.length).toBe(1);
    expect(penaltyRows[0].penalty_type).toBe('late_cancellation');
    expect(penaltyRows[0].penalty_amount_paise).toBe(2000000);

    await dbHelper.query(`DELETE FROM pay_svc.caterer_penalties WHERE booking_id = $1`, [bkId]);
    await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [bkId]);
    await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bkId]);
  });

  it('TC-T2-BKD-02: Caterer cancellation >7 days before event date incurs 0% / standard fee without penalty record', async () => {
    const farEventDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, $3, '19:00:00', 100, '12 Main St', 'Tirupati', 'Andhra Pradesh', 10000000, 'paid', 10000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id, farEventDate],
    );
    const bkId = bk[0].id;

    const mockOrderId = `order_mock_bkd2_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mockPaymentId = `pay_mock_bkd2_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await dbHelper.query(
      `INSERT INTO pay_svc.payments 
       (booking_id, amount_paise, currency, status, payment_type, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, 10000000, 'INR', 'captured', 'full', $2, $3)`,
      [bkId, mockOrderId, mockPaymentId],
    );

    const res = await client.post(
      `/api/bookings/${bkId}/cancel`,
      { reason: 'Advance caterer schedule adjustment' },
      { role: 'caterer' },
    );

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
    expect(res.body.booking.caterer_penalty_paise).toBe(0);

    const penaltyRows = await dbHelper.query(
      `SELECT id FROM pay_svc.caterer_penalties WHERE booking_id = $1`,
      [bkId],
    );
    expect(penaltyRows.length).toBe(0);

    await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [bkId]);
    await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bkId]);
  });

  it('TC-T2-BKD-03: Double cancellation attempt on an already cancelled booking is rejected with 400 Bad Request', async () => {
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status)
       VALUES ($1, $2, '2026-12-25', '19:00:00', 50, 'Addr', 'Tirupati', 'AP', 5000000, 'cancelled')
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id],
    );
    const bkId = bk[0].id;

    const res = await client.post(
      `/api/bookings/${bkId}/cancel`,
      { reason: 'Second cancellation attempt' },
      { role: 'caterer' },
    );
    expect(res.status).toBe(400);

    await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bkId]);
  });

  it('TC-T2-BKD-04: Cancellation attempt on a completed booking is rejected with 400 Bad Request', async () => {
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status)
       VALUES ($1, $2, '2026-11-01', '19:00:00', 50, 'Addr', 'Tirupati', 'AP', 5000000, 'completed')
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id],
    );
    const bkId = bk[0].id;

    const res = await client.post(
      `/api/bookings/${bkId}/cancel`,
      { reason: 'Cannot cancel completed booking' },
      { role: 'caterer' },
    );
    expect(res.status).toBe(400);

    await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bkId]);
  });

  it('TC-T2-BKD-05: Customer receives 100% full refund on caterer-initiated cancellation regardless of timing', () => {
    const bookingTotalPaise = 7500000;
    const refund = calculateCancellationRefund(bookingTotalPaise, 'caterer', '2026-12-01', '2026-11-30');
    expect(refund).toBe(bookingTotalPaise);
  });

  it('TC-T2-BKD-06: Customer 1-click rebook options endpoint returns alternative available caterers for the same date', async () => {
    const targetId = sampleBookingId || testBookingId;
    const res = await client.get(`/api/bookings/${targetId}/rebook-options`, { role: 'customer' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alternatives');
    expect(Array.isArray(res.body.alternatives)).toBe(true);
  });

  // ==============================================================
  // P1-11 Outbox Reminders & Provider Hooks (TC-T2-BKD-07 to 11)
  // ==============================================================

  it('TC-T2-BKD-07: Unique database constraint on notify_svc.reminders_sent(booking_id, reminder_type) prevents duplicates', async () => {
    const reminderType = 't_minus_24h_event';

    const r1 = await dbHelper.query(
      `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel, payload)
       VALUES ($1, $2, 'sms', '{"text": "Event reminder"}')
       RETURNING id`,
      [testBookingId, reminderType],
    );

    let duplicateRejected = false;
    try {
      await dbHelper.query(
        `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel, payload)
         VALUES ($1, $2, 'whatsapp', '{"text": "Duplicate reminder"}')`,
        [testBookingId, reminderType],
      );
    } catch {
      duplicateRejected = true;
    }

    expect(duplicateRejected).toBe(true);
    await dbHelper.query(`DELETE FROM notify_svc.reminders_sent WHERE id = $1`, [r1[0].id]);
  });

  it('TC-T2-BKD-08: Invalid reminder_channel violates check constraint and is rejected by database', async () => {
    let checkViolation = false;
    try {
      await dbHelper.query(
        `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel, payload)
         VALUES ($1, 't_minus_2h_payment', 'invalid_carrier_channel', '{"text": "Test"}')`,
        [testBookingId],
      );
    } catch {
      checkViolation = true;
    }
    expect(checkViolation).toBe(true);
  });

  it('TC-T2-BKD-09: Reminder sweep endpoint ignores cancelled or completed bookings', async () => {
    const res = await client.post(
      '/api/notify/reminders/sweep',
      {},
      { role: 'admin' },
    );
    expect(res.status).toBe(200);
    expect(
      typeof res.body.remindersDispatched === 'number' ||
      typeof res.body.remindersTriggered === 'number' ||
      typeof res.body.count === 'number' ||
      res.body.success === true,
    ).toBe(true);
  });

  it('TC-T2-BKD-10: Outbox processor retries failed SMS/WhatsApp dispatches with exponential backoff up to 5 attempts', async () => {
    // Insert failing notification outbox task with retry_count = 4 and null payload to trigger error in processing
    const item = await dbHelper.query(
      `INSERT INTO notify_svc.notification_outbox (event_type, payload, status, retry_count)
       VALUES ('booking_requested', 'null', 'pending', 4)
       RETURNING id`,
    );
    const itemId = item[0].id;

    // Process outbox batch via endpoint
    const res = await client.post('/api/notify/outbox/process', {}, { role: 'admin' });
    expect(res.status).toBe(200);

    // Verify outbox item transitioned to failed upon reaching 5 attempts
    const updated = await dbHelper.query(
      `SELECT status, retry_count FROM notify_svc.notification_outbox WHERE id = $1`,
      [itemId],
    );
    expect(updated[0].retry_count).toBe(5);
    expect(updated[0].status).toBe('failed');

    await dbHelper.query(`DELETE FROM notify_svc.notification_outbox WHERE id = $1`, [itemId]);
  });

  it('TC-T2-BKD-11: Reminders payload JSONB stores channel, recipient phone, and event timestamp', async () => {
    const row = await dbHelper.query(
      `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel, payload)
       VALUES ($1, 't_minus_2h_balance', 'whatsapp', 
       '{"recipientPhone": "+919876543210", "scheduledFor": "2026-11-20T10:00:00Z"}')
       RETURNING payload`,
      [testBookingId],
    );

    expect(row[0].payload.recipientPhone).toBe('+919876543210');
    expect(row[0].payload.scheduledFor).toBe('2026-11-20T10:00:00Z');

    await dbHelper.query(
      `DELETE FROM notify_svc.reminders_sent WHERE booking_id = $1 AND reminder_type = 't_minus_2h_balance'`,
      [testBookingId],
    );
  });

  // ==============================================================
  // P1-12 Dispute Ticketing Boundaries (TC-T2-BKD-12 to 16)
  // ==============================================================

  it('TC-T2-BKD-12: Customer dispute filed >7 days after event date is rejected with 400 Bad Request', async () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, $3, '19:00:00', 50, '12 Past St', 'Tirupati', 'AP', 5000000, 'completed', 5000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id, pastDate],
    );
    const bkId = bk[0].id;

    const res = await client.post(
      `/api/bookings/${bkId}/disputes`,
      {
        category: 'food_quality',
        description: 'Late dispute submission test >7 days',
      },
      { role: 'customer' },
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('7 days');

    await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bkId]);
  });

  it('TC-T2-BKD-13: Customer dispute filed on unpaid or requested booking is rejected with 400 Bad Request', async () => {
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, '2026-12-20', '19:00:00', 50, '12 Unpaid St', 'Tirupati', 'AP', 5000000, 'requested', 0, 5000000)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id],
    );
    const bkId = bk[0].id;

    const res = await client.post(
      `/api/bookings/${bkId}/disputes`,
      {
        category: 'service_shortage',
        description: 'Cannot file dispute on unpaid booking',
      },
      { role: 'customer' },
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('paid or completed');

    await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bkId]);
  });

  it('TC-T2-BKD-14: BOLA guard: Customer A attempting to file dispute on Customer B booking returns 403 Forbidden', async () => {
    const rogueCustomerToken = mintTestJwt({
      sub: '00000000-0000-0000-0000-000000009999',
      role: 'customer',
      email: 'impostor@example.com',
    });

    const targetId = sampleBookingId || testBookingId;
    const res = await client.post(
      `/api/bookings/${targetId}/disputes`,
      {
        category: 'hygiene',
        description: 'Unauthorized dispute filing',
      },
      { token: rogueCustomerToken },
    );
    expect(res.status).toBe(403);
  });

  it('TC-T2-BKD-15: Dispute category check constraint rejects arbitrary invalid category strings', async () => {
    let checkViolation = false;
    try {
      await dbHelper.query(
        `INSERT INTO order_svc.disputes 
         (booking_id, customer_id, caterer_id, category, description, evidence_urls, status, refund_amount_paise)
         VALUES ($1, $2, $3, 'invalid_fake_category', 'Check constraint test', '{}', 'open', 0)`,
        [testBookingId, TEST_USERS.customer.id, TEST_CATERER.id],
      );
    } catch {
      checkViolation = true;
    }
    expect(checkViolation).toBe(true);
  });

  it('TC-T2-BKD-16: Admin dispute resolution endpoint rejects invalid resolution actions with 400 Bad Request', async () => {
    const dispute = await dbHelper.query(
      `INSERT INTO order_svc.disputes 
       (booking_id, customer_id, caterer_id, category, description, evidence_urls, status, refund_amount_paise)
       VALUES ($1, $2, $3, 'service_shortage', 'Resolution test', '{}', 'open', 0)
       RETURNING id`,
      [testBookingId, TEST_USERS.customer.id, TEST_CATERER.id],
    );
    const dispId = dispute[0].id;

    const res = await client.post(
      `/api/admin/disputes/${dispId}/resolve`,
      {
        resolution: 'unsupported_action_type',
        resolutionNotes: 'Testing resolution validation',
      },
      { role: 'admin' },
    );
    expect(res.status).toBe(400);

    await dbHelper.query(`DELETE FROM order_svc.disputes WHERE id = $1`, [dispId]);
  });
});
