import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 4: Scenario 4 — Late Cancellation, Full Customer Refund & Rebook Flow', () => {
  const client = createApiClient();
  let bookingId: string;
  let penaltyId: string;
  let rebookedId: string;
  const originalCatererId = TEST_CATERER.id;
  const totalAmountPaise = 8000000; // ₹80,000
  const amountPaidPaise = 2000000;  // ₹20,000
  const nearEventDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  beforeAll(async () => {
    await startAllServers();
    await dbHelper.query(`DELETE FROM caterer_svc.caterer_availability WHERE unavailable_date = $1`, [nearEventDate]);
    await dbHelper.query(
      `UPDATE caterer_svc.caterers SET status = 'approved' WHERE id = $1`,
      [originalCatererId],
    );
  });

  afterAll(async () => {
    await dbHelper.query(`DELETE FROM caterer_svc.caterer_availability WHERE unavailable_date = $1`, [nearEventDate]);
    if (penaltyId) {
      await dbHelper.query(`DELETE FROM pay_svc.caterer_penalties WHERE id = $1`, [penaltyId]);
    }
    if (rebookedId) {
      await dbHelper.query(`DELETE FROM order_svc.booking_status_history WHERE booking_id = $1`, [rebookedId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [rebookedId]);
    }
    if (bookingId) {
      await dbHelper.query(`DELETE FROM notify_svc.notification_outbox WHERE payload->>'bookingId' = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.booking_status_history WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bookingId]);
    }
    await stopAllServers();
  });

  it('Step 1: Confirmed booking exists 48 hours prior to event date', async () => {
    const booking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', $3, '18:00:00', 100, 'Main Hall', 'Tirupati', 'Andhra Pradesh', $4, 'paid', $5, $6)
       RETURNING id, status, total_amount_paise`,
      [TEST_USERS.customer.id, originalCatererId, nearEventDate, totalAmountPaise, amountPaidPaise, totalAmountPaise - amountPaidPaise],
    );
    bookingId = booking[0].id;

    expect(booking[0].status).toBe('paid');
  });

  it('Step 2: Caterer initiates late cancellation 48h before event via POST /api/bookings/:id/cancel', async () => {
    const res = await client.post(
      `/api/bookings/${bookingId}/cancel`,
      { reason: 'Kitchen emergency prevents banquet execution' },
      { role: 'caterer' },
    );

    expect(res.status).toBe(200);

    const booking = await dbHelper.getBooking(bookingId);
    expect(booking.status).toBe('cancelled');
    expect(booking.cancel_reason).toContain('Kitchen emergency');
  });

  it('Step 3: Customer receives 100% full refund; caterer is assessed a 20% penalty', async () => {
    const booking = await dbHelper.getBooking(bookingId);
    expect(booking.refund_amount_paise).toBe(amountPaidPaise);

    const penalties = await dbHelper.query(
      `SELECT * FROM pay_svc.caterer_penalties WHERE booking_id = $1`,
      [bookingId],
    );

    expect(penalties.length).toBe(1);
    penaltyId = penalties[0].id;
    expect(penalties[0].penalty_type).toBe('late_cancellation');
    expect(penalties[0].penalty_amount_paise).toBe(Math.round(totalAmountPaise * 0.20));
  });

  it('Step 4: System enqueues urgent cancellation notification outbox task with direct rebook link', async () => {
    const outbox = await dbHelper.query(
      `SELECT * FROM notify_svc.notification_outbox WHERE payload->>'bookingId' = $1`,
      [bookingId],
    );

    expect(outbox.length).toBeGreaterThan(0);
    const eventTypes = outbox.map((r: any) => r.event_type);
    expect(eventTypes.some((t: string) => t.includes('cancel'))).toBe(true);
  });

  it('Step 5: Customer queries rebook alternatives endpoint for available replacement caterers', async () => {
    const res = await client.get(`/api/bookings/${bookingId}/rebook-options`, { role: 'customer' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.alternatives)).toBe(true);
  });

  it('Step 6: Customer 1-click rebooks replacement caterer; rebooked booking links to original cancelled booking via POST /api/bookings/:id/rebook', async () => {
    const rebookRes = await client.post(
      `/api/bookings/${bookingId}/rebook`,
      {
        catererId: originalCatererId,
        packageId: TEST_CATERER.packageId,
        eventDate: nearEventDate,
        guestCount: 100,
        venueAddress: 'Main Hall',
        city: 'Tirupati',
      },
      { role: 'customer' },
    );

    expect(rebookRes.status).toBe(201);
    expect(rebookRes.body.booking).toBeDefined();
    rebookedId = rebookRes.body.booking.id;
    expect(rebookRes.body.booking.rebooked_from_booking_id).toBe(bookingId);

    const dbBooking = await dbHelper.getBooking(rebookedId);
    expect(dbBooking.rebooked_from_booking_id).toBe(bookingId);
  });
});
