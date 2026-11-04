import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildBookingServer } from '../src';
import { pgPool } from '../src/db';

describe('Booking & Order Service Integration', () => {
  const app = buildBookingServer();
  let createdBookingId = '';

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pgPool.end();
  });

  it('responds with 200 on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'booking-order-service' });
  });

  it('creates a new booking request in requested state with calculated paise', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001',
      },
      payload: {
        catererId: 'd0000000-0000-0000-0000-000000000001',
        packageId: 'e0000000-0000-0000-0000-000000000001',
        eventDate: '2026-12-15',
        eventTime: '12:30:00',
        guestCount: 100,
        venueAddress: 'Near Alipiri Gate, Tirupati',
        city: 'Tirupati',
        specialRequests: 'Traditional banana leaf service preferred',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.booking).toBeDefined();
    expect(body.booking.status).toBe('requested');
    // Package 1 is 35000 paise (₹350) * 100 guests = 3500000 paise (₹35,000)
    expect(body.booking.total_amount_paise).toBe(3500000);
    createdBookingId = body.booking.id;
  });

  it('allows caterer to accept booking and snapshots 15% platform commission', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${createdBookingId}/accept`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000002',
      },
      payload: {
        catererNote: 'We would be honored to cater your event.',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.booking.status).toBe('accepted');
    // 15% of 3500000 paise = 525000 paise (₹5,250)
    expect(body.booking.commission_amount_paise).toBe(525000);
    expect(body.booking.caterer_note).toBe('We would be honored to cater your event.');
  });

  it('rejects invalid state transition directly from accepted to completed without payment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${createdBookingId}/complete`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000002',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Cannot transition booking from accepted to completed');
  });

  it('allows customer to cancel an accepted booking before payment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${createdBookingId}/cancel`,
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001',
        'x-user-role': 'customer',
      },
      payload: {
        reason: 'Event rescheduled',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.booking.status).toBe('cancelled');
    expect(body.booking.cancelled_by).toBe('customer');
  });

  it('rejects booking request on an unavailable or blackout date', async () => {
    const catererId = 'd0000000-0000-0000-0000-000000000001';
    const blockedDate = '2026-11-20';

    // Seed blocked date in caterer_availability
    await pgPool.query(
      `INSERT INTO caterer_svc.caterer_availability (caterer_id, unavailable_date, reason)
       VALUES ($1, $2, 'Karthika Deepam Festival')
       ON CONFLICT (caterer_id, unavailable_date) DO NOTHING`,
      [catererId, blockedDate]
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001',
      },
      payload: {
        catererId,
        packageId: 'e0000000-0000-0000-0000-000000000001',
        eventDate: blockedDate,
        eventTime: '12:00:00',
        guestCount: 50,
        venueAddress: 'Tirupati Main Temple road',
        city: 'Tirupati',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('Caterer is not available on 2026-11-20');
  });

  it('allows admin to query all platform bookings and cancel with dispute resolution', async () => {
    // 1. Query all bookings
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/bookings',
    });
    expect(listRes.statusCode).toBe(200);
    const bookings = listRes.json().bookings;
    expect(Array.isArray(bookings)).toBe(true);
    expect(bookings.length).toBeGreaterThanOrEqual(1);

    // 2. Create a test booking to cancel via admin
    const catererId = 'd0000000-0000-0000-0000-000000000001';
    const testDate = '2026-11-29';
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { 'x-user-id': 'c0000000-0000-0000-0000-000000000001' },
      payload: {
        catererId,
        packageId: 'e0000000-0000-0000-0000-000000000001',
        eventDate: testDate,
        eventTime: '13:00:00',
        guestCount: 20,
        venueAddress: 'Admin dispute hall, Tirupati',
        city: 'Tirupati',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const bookingId = createRes.json().booking.id;

    // 3. Admin cancel dispute
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/admin/bookings/${bookingId}/cancel`,
      payload: { reason: 'Venue hall closed unexpectedly due to municipal repair' },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().booking.status).toBe('cancelled');
    expect(cancelRes.json().booking.cancelled_by).toBe('admin');
  });
});