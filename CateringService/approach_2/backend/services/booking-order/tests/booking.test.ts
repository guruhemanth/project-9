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
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
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
        'x-user-role': 'caterer',
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
        'x-user-role': 'caterer',
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
    const adminHeaders = {
      'x-user-id': 'c0000000-0000-0000-0000-000000000003',
      'x-user-role': 'admin',
    };

    // 1. Query all bookings
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/bookings',
      headers: adminHeaders,
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
      headers: { 'x-user-id': 'c0000000-0000-0000-0000-000000000001', 'x-user-role': 'customer' },
      payload: {
        catererId,
        packageId: 'e0000000-0000-0000-0000-000000000001',
        eventDate: testDate,
        eventTime: '13:00:00',
        guestCount: 50,
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
      headers: adminHeaders,
      payload: { reason: 'Venue hall closed unexpectedly due to municipal repair' },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().booking.status).toBe('cancelled');
    expect(cancelRes.json().booking.cancelled_by).toBe('admin');
  });

  it('enforces P0-18 and P0-20 booking validation rules', async () => {
    const customerHeaders = {
      'x-user-id': 'c0000000-0000-0000-0000-000000000001',
      'x-user-role': 'customer',
    };
    const validCatererId = 'd0000000-0000-0000-0000-000000000001';
    const validPackageId = 'e0000000-0000-0000-0000-000000000001';

    // 1. P0-20: Reject past date
    const pastRes = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: customerHeaders,
      payload: {
        catererId: validCatererId,
        packageId: validPackageId,
        eventDate: '2020-01-01',
        eventTime: '12:00:00',
        guestCount: 50,
        venueAddress: 'Past Hall, Tirupati',
        city: 'Tirupati',
      },
    });
    expect(pastRes.statusCode).toBe(400);
    expect(pastRes.json().error).toContain('Event date cannot be in the past');

    // 2. P0-20: Reject date violating minimum lead time (lead_time_days is 2 days)
    const today = new Date();
    const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
    const leadTimeRes = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: customerHeaders,
      payload: {
        catererId: validCatererId,
        packageId: validPackageId,
        eventDate: tomorrowStr,
        eventTime: '12:00:00',
        guestCount: 50,
        venueAddress: 'Quick Hall, Tirupati',
        city: 'Tirupati',
      },
    });
    expect(leadTimeRes.statusCode).toBe(400);
    expect(leadTimeRes.json().error).toContain('minimum lead time');

    // 3. P0-20: Reject city not served by caterer
    const cityRes = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: customerHeaders,
      payload: {
        catererId: validCatererId,
        packageId: validPackageId,
        eventDate: '2026-12-25',
        eventTime: '12:00:00',
        guestCount: 50,
        venueAddress: 'Marine Drive, Mumbai',
        city: 'Mumbai',
      },
    });
    expect(cityRes.statusCode).toBe(400);
    expect(cityRes.json().error).toContain('Caterer does not serve Mumbai');

    // 4. P0-18: Reject unapproved caterer
    const pendingCatId = 'd0000000-0000-0000-0000-999999999999';
    await pgPool.query(
      `INSERT INTO caterer_svc.caterers (id, owner_id, business_name, city, status, fssai_number)
       VALUES ($1, gen_random_uuid(), 'Unapproved Caterer', 'Tirupati', 'pending', '12345678901234')
       ON CONFLICT (id) DO UPDATE SET status = 'pending'`,
      [pendingCatId]
    );

    const unapprovedRes = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: customerHeaders,
      payload: {
        catererId: pendingCatId,
        customComboName: 'Demo Combo',
        eventDate: '2026-12-25',
        eventTime: '12:00:00',
        guestCount: 50,
        venueAddress: 'Test Hall, Tirupati',
        city: 'Tirupati',
      },
    });
    expect(unapprovedRes.statusCode).toBe(400);
    expect(unapprovedRes.json().error).toContain('not approved');
  });

  it('enforces P1-13 customer contact details masking for caterers until deposit is paid', async () => {
    const catererHeaders = {
      'x-user-id': 'c0000000-0000-0000-0000-000000000002',
      'x-user-role': 'caterer',
    };
    const catererId = 'd0000000-0000-0000-0000-000000000001';

    // 1. Create a fresh booking in 'requested' state
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { 'x-user-id': 'c0000000-0000-0000-0000-000000000001', 'x-user-role': 'customer' },
      payload: {
        catererId,
        packageId: 'e0000000-0000-0000-0000-000000000001',
        eventDate: '2026-12-28',
        eventTime: '14:00:00',
        guestCount: 50,
        venueAddress: 'Masking Test Venue, Tirupati',
        city: 'Tirupati',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const bId = createRes.json().booking.id;

    // 2. Caterer retrieves single booking while unpaid: contact details MUST be masked
    const viewUnpaid = await app.inject({
      method: 'GET',
      url: `/api/bookings/${bId}`,
      headers: catererHeaders,
    });
    expect(viewUnpaid.statusCode).toBe(200);
    const bUnpaid = viewUnpaid.json().booking;
    expect(bUnpaid.contact_locked).toBe(true);
    expect(bUnpaid.customer_phone).toContain('•');
    expect(bUnpaid.customer_email).toContain('•••••@');

    // 3. Mark booking paid in DB (as would happen via verified webhook)
    await pgPool.query(
      "UPDATE order_svc.bookings SET status = 'paid', amount_paid_paise = 25000 WHERE id = $1",
      [bId]
    );

    // 4. Caterer retrieves single booking after payment: contact details MUST be unlocked
    const viewPaid = await app.inject({
      method: 'GET',
      url: `/api/bookings/${bId}`,
      headers: catererHeaders,
    });
    expect(viewPaid.statusCode).toBe(200);
    const bPaid = viewPaid.json().booking;
    expect(bPaid.contact_locked).toBe(false);
    expect(bPaid.customer_phone).not.toContain('•');
    expect(bPaid.customer_email).not.toContain('•••••');
  });
});