import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { pgPool } from './db';
import {
  bookingRequestSchema,
  BookingStatus,
  canTransitionBooking,
  calculateCancellationRefund,
  validateEnv,
  createDbEnvSchema,
  buildCorsOptions,
  registerCentralizedErrorHandler,
  loggerRedactionConfig,
  getAuthenticatedUser,
  signInternalToken,
} from '@caterconnect/shared';
import { enqueueOutboxNotification } from './outbox';

export function buildBookingServer() {
  const env = validateEnv(createDbEnvSchema(), process.env);
  const jwtSecret = process.env.JWT_SECRET || 'dev_secret_jwt_caterconnect_secure';
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576,
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });

  registerCentralizedErrorHandler(server, 'booking-order-service');

  // Helper: Periodically expire accepted bookings where 12-hour payment window passed
  async function checkAndExpireBookings(): Promise<void> {
    try {
      const expiredRes = await pgPool.query(
        `SELECT id, caterer_id, event_date, customer_id
         FROM order_svc.bookings
         WHERE status = 'accepted' AND payment_deadline IS NOT NULL AND payment_deadline < NOW()`
      );

      for (const row of expiredRes.rows) {
        const client = await pgPool.connect();
        let expiredSuccessfully = false;
        try {
          await client.query('BEGIN');
          const upd = await client.query(
            `UPDATE order_svc.bookings
             SET status = 'expired', updated_at = NOW()
             WHERE id = $1 AND status = 'accepted'`,
            [row.id]
          );

          if (upd.rowCount && upd.rowCount > 0) {
            await client.query(
              `DELETE FROM caterer_svc.caterer_availability WHERE booking_id = $1 AND auto_locked = TRUE`,
              [row.id]
            );
            await client.query(
              `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, note)
               VALUES ($1, 'accepted', 'expired', '12-hour customer payment window elapsed without 25% advance payment')`,
              [row.id]
            );
            expiredSuccessfully = true;
          }
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          server.log.warn({ txErr, bookingId: row.id }, 'Failed to expire booking row');
          continue;
        } finally {
          client.release();
        }

        if (expiredSuccessfully) {
          await enqueueOutboxNotification('booking_cancelled', {
            bookingId: row.id,
            customerId: row.customer_id,
            cancelledBy: 'system',
            eventDate: row.event_date,
            refundINR: '₹0',
            reason: '12-hour payment window expired',
          });
        }
      }
    } catch (err: any) {
      server.log.warn({ err }, 'Error checking expired bookings');
    }
  }

  const expiryTimer = setInterval(() => {
    checkAndExpireBookings();
  }, 60000);
  expiryTimer.unref();

  server.addHook('onClose', async () => {
    clearInterval(expiryTimer);
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  server.register(fastifyHelmet, { contentSecurityPolicy: false });
  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));

  // Helper: Assert that actor owns the caterer business associated with this booking
  async function assertBookingCatererOwner(bookingId: string, actorId: string, actorRole: string): Promise<{ authorized: boolean; booking?: any }> {
    if (actorRole === 'admin') {
      const bRes = await pgPool.query('SELECT * FROM order_svc.bookings WHERE id = $1', [bookingId]);
      return { authorized: bRes.rows.length > 0, booking: bRes.rows[0] };
    }
    const res = await pgPool.query(
      `SELECT b.*, c.owner_id 
       FROM order_svc.bookings b
       JOIN caterer_svc.caterers c ON b.caterer_id = c.id
       WHERE b.id = $1`,
      [bookingId]
    );
    if (res.rows.length === 0) return { authorized: false };
    const b = res.rows[0];
    return { authorized: b.owner_id === actorId, booking: b };
  }

  // Health & Readiness checks
  server.get('/health', async () => ({ status: 'ok', service: 'booking-order-service' }));
  server.get('/ready', async (_req, reply) => {
    try {
      await pgPool.query('SELECT 1');
      return { status: 'ready', database: 'connected', service: 'booking-order-service' };
    } catch (err: any) {
      return reply.status(503).send({ status: 'not_ready', database: 'disconnected', service: 'booking-order-service' });
    }
  });

  // Create booking request (Customer)
  server.post('/api/bookings', async (req, reply) => {
    try {
      const parseResult = bookingRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const customerId = authUser.userId;

      // Verify customer has a valid phone number before allowing booking submission
      const uRes = await pgPool.query('SELECT phone FROM auth_svc.users WHERE id = $1', [customerId]);
      if (uRes.rows.length > 0 && !uRes.rows[0].phone) {
        return reply.status(400).send({ error: 'Please add and verify your phone number before placing a booking.' });
      }

      const { catererId, packageId, customComboName, customizedItems, eventDate, eventTime, guestCount, venueAddress, city, state, pincode, specialRequests } =
        parseResult.data;

      // Verify caterer existence, approval status, service area, and rules
      const catRuleRes = await pgPool.query(
        'SELECT status, min_guests, max_guests, business_name, lead_time_days, city, service_areas, instant_booking_enabled, COALESCE(commission_pct, 15.00) as commission_pct FROM caterer_svc.caterers WHERE id = $1',
        [catererId]
      );

      if (catRuleRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Caterer not found' });
      }

      const caterer = catRuleRes.rows[0];

      // P0-18: Verify caterer status is 'approved'
      if (caterer.status !== 'approved') {
        return reply.status(400).send({
          error: 'This caterer is not approved for booking requests.',
        });
      }

      // P0-20: Validate event date is not in the past (using IST / Asia/Kolkata)
      const todayKolkata = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (eventDate < todayKolkata) {
        return reply.status(400).send({ error: 'Event date cannot be in the past' });
      }

      // P0-20: Validate minimum lead time
      const eventD = new Date(eventDate + 'T00:00:00Z');
      const todayD = new Date(todayKolkata + 'T00:00:00Z');
      const diffDays = Math.round((eventD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
      const requiredLeadDays = caterer.lead_time_days ?? 2;
      if (diffDays < requiredLeadDays) {
        return reply.status(400).send({
          error: `Booking requires a minimum lead time of ${requiredLeadDays} days.`,
        });
      }

      // P0-20: Validate caterer service area / city
      const requestedCity = (city || '').trim().toLowerCase();
      const catererCity = (caterer.city || '').trim().toLowerCase();
      const serviceAreas = (caterer.service_areas || []).map((a: string) => a.trim().toLowerCase());
      const servesCity =
        requestedCity === catererCity ||
        serviceAreas.includes(requestedCity) ||
        serviceAreas.some((a: string) => venueAddress.toLowerCase().includes(a));
      if (!servesCity) {
        return reply.status(400).send({
          error: `Caterer does not serve ${city}. Supported city is ${caterer.city}.`,
        });
      }

      // Check caterer availability for eventDate
      const availRes = await pgPool.query(
        'SELECT reason, auto_locked FROM caterer_svc.caterer_availability WHERE caterer_id = $1 AND unavailable_date = $2 LIMIT 1',
        [catererId, eventDate]
      );

      if (availRes.rows.length > 0) {
        const conflict = availRes.rows[0];
        return reply.status(409).send({
          error: `Caterer is not available on ${eventDate}: ${conflict.reason || 'Already booked'}`,
        });
      }

      // Verify caterer minimum and maximum guest rules
      if (caterer.min_guests && guestCount < caterer.min_guests) {
        return reply.status(400).send({
          error: `Booking requires a minimum of ${caterer.min_guests} guests for ${caterer.business_name || 'this caterer'}.`,
        });
      }
      if (caterer.max_guests && guestCount > caterer.max_guests) {
        return reply.status(400).send({
          error: `Booking exceeds maximum limit of ${caterer.max_guests} guests for ${caterer.business_name || 'this caterer'}.`,
        });
      }

      let totalAmountPaise = 0;
      let effectiveCustomizedItems = customizedItems || [];

      // Case 1: Customized item-by-item feast combo
      if (customizedItems && customizedItems.length > 0) {
        const itemIds = customizedItems.map((i) => i.id).filter(Boolean);
        const itemsRes = await pgPool.query(
          `SELECT id, name, category, price_paise, is_veg 
           FROM caterer_svc.menu_items 
           WHERE caterer_id = $1 AND id = ANY($2::uuid[])`,
          [catererId, itemIds]
        );

        if (itemsRes.rows.length === 0) {
          return reply.status(400).send({ error: 'None of the selected custom items were found for this caterer.' });
        }

        effectiveCustomizedItems = itemsRes.rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          pricePaise: r.price_paise,
          isVeg: r.is_veg,
        }));

        const pricePerPlate = itemsRes.rows.reduce((sum, item) => sum + item.price_paise, 0);
        totalAmountPaise = pricePerPlate * guestCount;
      }
      // Case 2: Standard pre-set package
      else if (packageId) {
        const pkgRes = await pgPool.query(
          'SELECT price_per_plate_paise FROM caterer_svc.packages WHERE id = $1 AND caterer_id = $2',
          [packageId, catererId]
        );

        if (pkgRes.rows.length === 0) {
          return reply.status(404).send({ error: 'Package not found for this caterer' });
        }

        const pricePerPlate = pkgRes.rows[0].price_per_plate_paise;
        totalAmountPaise = pricePerPlate * guestCount;
      } else {
        return reply.status(400).send({ error: 'Either packageId or customizedItems must be provided.' });
      }

      const isInstant = caterer.instant_booking_enabled === true;
      const bookingMode = isInstant ? 'instant' : 'on_request';

      // Snapshot commission percentage and calculate commission paise at creation time (P0-9)
      const commissionPct = parseFloat(caterer.commission_pct || '15.00');
      const commissionAmountPaise = Math.round((totalAmountPaise * commissionPct) / 100);

      const insertRes = await pgPool.query(
        `INSERT INTO order_svc.bookings 
         (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, pincode, special_requests, total_amount_paise, customized_items, custom_combo_name, status, booking_mode, commission_pct, commission_amount_paise)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'requested', $15, $16, $17)
         RETURNING *`,
        [
          customerId,
          catererId,
          packageId || null,
          eventDate,
          eventTime,
          guestCount,
          venueAddress,
          city,
          state || 'Andhra Pradesh',
          pincode || null,
          specialRequests || null,
          totalAmountPaise,
          JSON.stringify(effectiveCustomizedItems),
          customComboName || (packageId ? null : 'Custom Feast Combo'),
          bookingMode,
          commissionPct,
          commissionAmountPaise,
        ]
      );

      const booking = insertRes.rows[0];

      // Insert audit history
      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by)
         VALUES ($1, NULL, 'requested', $2)`,
        [booking.id, customerId]
      );

      // Enqueue Outbox event: booking_requested -> caterer
      const catererOwnerRes = await pgPool.query(
        `SELECT c.owner_id, c.business_name, u.phone 
         FROM caterer_svc.caterers c
         JOIN auth_svc.users u ON c.owner_id = u.id
         WHERE c.id = $1`,
        [catererId]
      );
      const catererOwner = catererOwnerRes.rows[0];
      await enqueueOutboxNotification('booking_requested', {
        bookingId: booking.id,
        customerId,
        catererId,
        catererOwnerId: catererOwner?.owner_id,
        catererPhone: catererOwner?.phone,
        catererName: catererOwner?.business_name,
        eventDate,
        guestCount,
      });

      // Broadcast real-time NOTIFY 'booking_requested' (R2)
      try {
        const realtimeEnvelope = {
          event: 'booking_requested',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId: booking.id,
            catererId,
            customerId,
            status: 'requested',
            amountPaise: booking.total_amount_paise || 0,
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        req.log.warn({ notifyErr }, 'Failed to emit pg_notify for booking_requested');
      }

      return reply.status(201).send({ booking });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to create booking' });
    }
  });

  // Get customer bookings
  server.get('/api/bookings/customer', async (req, reply) => {
    await checkAndExpireBookings();
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }

    const customerId = authUser.userId;

    const res = await pgPool.query(
      `SELECT b.*, c.business_name, c.city as caterer_city, COALESCE(p.name, b.custom_combo_name, 'Custom Feast Combo') as package_name
       FROM order_svc.bookings b
       JOIN caterer_svc.caterers c ON b.caterer_id = c.id
       LEFT JOIN caterer_svc.packages p ON b.package_id = p.id
       WHERE b.customer_id = $1
       ORDER BY b.created_at DESC`,
      [customerId]
    );

    return reply.send({ bookings: res.rows });
  });

  // Get caterer incoming bookings
  server.get('/api/bookings/caterer/:catererId', async (req, reply) => {
    await checkAndExpireBookings();
    const { catererId } = req.params as { catererId: string };
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }

    // Assert caller is the owner of this caterer business or admin
    if (authUser.role !== 'admin') {
      const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [catererId]);
      if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
      }
    }

    const res = await pgPool.query(
      `SELECT b.*, COALESCE(p.name, b.custom_combo_name, 'Custom Feast Combo') as package_name,
              u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email
       FROM order_svc.bookings b
       LEFT JOIN caterer_svc.packages p ON b.package_id = p.id
       LEFT JOIN auth_svc.users u ON b.customer_id = u.id
       WHERE b.caterer_id = $1
       ORDER BY b.event_date ASC, b.created_at DESC`,
      [catererId]
    );

    const rows = res.rows.map((row) => {
      const isPaid = row.status === 'paid' || row.status === 'completed';
      if (!isPaid && authUser.role !== 'admin') {
        return {
          ...row,
          customer_phone: row.customer_phone ? row.customer_phone.replace(/\d(?=\d{2})/g, '•') : null,
          customer_email: row.customer_email ? '•••••@' + (row.customer_email.split('@')[1] || 'domain.com') : null,
          contact_locked: true,
        };
      }
      return {
        ...row,
        contact_locked: false,
      };
    });

    return reply.send({ bookings: rows });
  });

  // Get single booking by ID (Must be customer, caterer owner, or admin)
  server.get('/api/bookings/:id', async (req, reply) => {
    await checkAndExpireBookings();
    const { id } = req.params as { id: string };
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }

    const res = await pgPool.query(
      `SELECT b.*, c.business_name, c.owner_id as caterer_owner_id, COALESCE(p.name, b.custom_combo_name, 'Custom Feast Combo') as package_name,
              u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email
       FROM order_svc.bookings b
       JOIN caterer_svc.caterers c ON b.caterer_id = c.id
       LEFT JOIN caterer_svc.packages p ON b.package_id = p.id
       LEFT JOIN auth_svc.users u ON b.customer_id = u.id
       WHERE b.id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Booking not found' });
    }

    const b = res.rows[0];
    if (authUser.role !== 'admin' && b.customer_id !== authUser.userId && b.caterer_owner_id !== authUser.userId) {
      return reply.status(403).send({ error: 'Forbidden: You are not a party to this booking' });
    }

    // P1-13: Hide customer contact details from caterer until deposit is paid
    const isPaid = b.status === 'paid' || b.status === 'completed';
    const isCatererParty = authUser.role !== 'admin' && b.customer_id !== authUser.userId;
    if (isCatererParty && !isPaid) {
      b.customer_phone = b.customer_phone ? b.customer_phone.replace(/\d(?=\d{2})/g, '•') : null;
      b.customer_email = b.customer_email ? '•••••@' + (b.customer_email.split('@')[1] || 'domain.com') : null;
      b.contact_locked = true;
    } else {
      b.contact_locked = false;
    }

    return reply.send({ booking: b });
  });

  // Caterer Accepts Booking - OWNERSHIP GUARD
  server.post('/api/bookings/:id/accept', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const catererNote = (req.body as any)?.catererNote || null;

      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { authorized, booking } = await assertBookingCatererOwner(id, authUser.userId, authUser.role);
      if (!booking) return reply.status(404).send({ error: 'Booking not found' });
      if (!authorized) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
      }

      const currentStatus = booking.status as BookingStatus;
      if (!canTransitionBooking(currentStatus, 'accepted', authUser.role)) {
        return reply.status(400).send({ error: `Cannot transition booking from ${currentStatus} to accepted` });
      }

      const { caterer_id, event_date } = booking;

      // Auto-lock the date in caterer_availability atomically (P0-16)
      // If another booking already committed/locked this date, reject with 409 Conflict
      const lockRes = await pgPool.query(
        `INSERT INTO caterer_svc.caterer_availability (caterer_id, unavailable_date, reason, auto_locked, booking_id)
         VALUES ($1, $2, 'Booked via CaterConnect', TRUE, $3)
         ON CONFLICT (caterer_id, unavailable_date)
         DO UPDATE SET auto_locked = TRUE, booking_id = EXCLUDED.booking_id, reason = 'Booked via CaterConnect'
         WHERE caterer_svc.caterer_availability.booking_id IS NULL OR caterer_svc.caterer_availability.booking_id = EXCLUDED.booking_id
         RETURNING *`,
        [caterer_id, event_date, id]
      );

      if (lockRes.rows.length === 0) {
        return reply.status(409).send({
          error: 'Caterer is already committed to another booking on this date.',
        });
      }

      const totalPaise = booking.total_amount_paise || 0;
      const commissionPct = parseFloat(booking.commission_pct || '15.00');
      const commissionPaise = booking.commission_amount_paise || Math.round((totalPaise * commissionPct) / 100);

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings 
         SET status = 'accepted', 
             commission_pct = $1, 
             commission_amount_paise = $2,
             caterer_note = $3,
             payment_deadline = NOW() + INTERVAL '12 hours',
             updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [commissionPct, commissionPaise, catererNote, id]
      );

      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, 'accepted', $3, $4)`,
        [id, currentStatus, authUser.userId, catererNote]
      );

      // Enqueue Outbox event: booking_accepted -> customer
      const custRes = await pgPool.query('SELECT email, phone FROM auth_svc.users WHERE id = $1', [booking.customer_id]);
      const cust = custRes.rows[0];
      const catRes = await pgPool.query('SELECT business_name FROM caterer_svc.caterers WHERE id = $1', [booking.caterer_id]);
      await enqueueOutboxNotification('booking_accepted', {
        bookingId: id,
        customerId: booking.customer_id,
        recipientPhone: cust?.phone,
        catererName: catRes.rows[0]?.business_name,
        eventDate: booking.event_date,
        totalAmountINR: `₹${(totalPaise / 100).toLocaleString('en-IN')}`,
      });

      // Broadcast real-time NOTIFY 'booking_accepted' (R2)
      try {
        const realtimeEnvelope = {
          event: 'booking_accepted',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId: id,
            catererId: booking.caterer_id,
            customerId: booking.customer_id,
            status: 'accepted',
            amountPaise: totalPaise,
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        req.log.warn({ notifyErr }, 'Failed to emit pg_notify for booking_accepted');
      }

      return reply.send({ booking: updateRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to accept booking' });
    }
  });

  // Caterer Rejects Booking - OWNERSHIP GUARD
  server.post('/api/bookings/:id/reject', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const reason = (req.body as any)?.reason || 'Unavailable on selected date';

      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { authorized, booking } = await assertBookingCatererOwner(id, authUser.userId, authUser.role);
      if (!booking) return reply.status(404).send({ error: 'Booking not found' });
      if (!authorized) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
      }

      const currentStatus = booking.status as BookingStatus;
      if (!canTransitionBooking(currentStatus, 'rejected', authUser.role)) {
        return reply.status(400).send({ error: `Cannot transition booking from ${currentStatus} to rejected` });
      }

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings 
         SET status = 'rejected', caterer_note = $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [reason, id]
      );

      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, 'rejected', $3, $4)`,
        [id, currentStatus, authUser.userId, reason]
      );

      // Enqueue Outbox event: booking_rejected -> customer
      const catRes = await pgPool.query('SELECT business_name FROM caterer_svc.caterers WHERE id = $1', [booking.caterer_id]);
      await enqueueOutboxNotification('booking_rejected', {
        bookingId: id,
        customerId: booking.customer_id,
        catererName: catRes.rows[0]?.business_name,
        eventDate: booking.event_date,
        reason,
      });

      // Broadcast real-time NOTIFY 'booking_rejected' (R2)
      try {
        const realtimeEnvelope = {
          event: 'booking_rejected',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId: id,
            catererId: booking.caterer_id,
            customerId: booking.customer_id,
            status: 'rejected',
            amountPaise: booking.total_amount_paise || 0,
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        req.log.warn({ notifyErr }, 'Failed to emit pg_notify for booking_rejected');
      }

      return reply.send({ booking: updateRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to reject booking' });
    }
  });

  // Cancel Booking (with tiered refund calculation) - CUSTOMER OR CATERER OWNER OR ADMIN
  server.post('/api/bookings/:id/cancel', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { reason } = (req.body as any) || {};

      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const cur = await pgPool.query(
        `SELECT b.id, b.status, b.event_date, b.amount_paid_paise, b.total_amount_paise, b.caterer_id, b.customer_id, c.owner_id as caterer_owner_id
         FROM order_svc.bookings b
         JOIN caterer_svc.caterers c ON b.caterer_id = c.id
         WHERE b.id = $1`,
        [id]
      );
      if (cur.rows.length === 0) return reply.status(404).send({ error: 'Booking not found' });

      const row = cur.rows[0];
      const isCustomer = row.customer_id === authUser.userId;
      const isCatererOwner = row.caterer_owner_id === authUser.userId;
      const isAdmin = authUser.role === 'admin';

      if (!isCustomer && !isCatererOwner && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden: You cannot cancel another party\'s booking' });
      }

      const effectiveRole = isAdmin ? 'caterer' : (isCustomer ? 'customer' : 'caterer');
      const currentStatus = row.status as BookingStatus;

      if (!canTransitionBooking(currentStatus, 'cancelled', effectiveRole)) {
        return reply.status(400).send({ error: `Cannot transition booking from ${currentStatus} to cancelled` });
      }

      let refundPaise = 0;
      let penaltyPaise = 0;
      if (currentStatus === 'paid' && row.amount_paid_paise > 0) {
        if (effectiveRole === 'caterer') {
          // If caterer cancels a paid booking, customer gets 100% full refund
          refundPaise = row.amount_paid_paise;
          const today = new Date();
          const eventDate = new Date(row.event_date);
          const diffMs = eventDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays < 7) {
            penaltyPaise = Math.round((row.total_amount_paise || row.amount_paid_paise || 0) * 0.20);
            await pgPool.query(
              `INSERT INTO pay_svc.caterer_penalties (caterer_id, booking_id, penalty_type, penalty_amount_paise, status, reason)
               VALUES ($1, $2, 'late_cancellation', $3, 'pending', $4)`,
              [row.caterer_id, id, penaltyPaise, `Caterer cancelled booking ${diffDays} days prior to event`]
            );
          }
        } else {
          const eventDateStr = new Date(row.event_date).toISOString().split('T')[0];
          refundPaise = calculateCancellationRefund(row.amount_paid_paise, effectiveRole, eventDateStr);
        }
      }

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings 
         SET status = 'cancelled', 
             cancelled_by = $1, 
             cancel_reason = $2, 
             refund_amount_paise = $3,
             caterer_penalty_paise = $4,
             updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [effectiveRole, reason || 'User requested cancellation', refundPaise, penaltyPaise, id]
      );

      // Trigger automated payment gateway refund if customer had already paid
      if (refundPaise > 0) {
        const paymentSvcUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004';
        try {
          const internalToken = signInternalToken(
            { userId: 'booking-order-service', role: 'admin' },
            jwtSecret
          );
          await fetch(`${paymentSvcUrl}/api/payments/internal/refund`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-token': internalToken,
            },
            body: JSON.stringify({
              bookingId: id,
              refundAmountPaise: refundPaise,
              reason: reason || `${effectiveRole} cancelled booking`,
            }),
          });
        } catch (rfErr: any) {
          req.log.warn({ rfErr }, 'Automated refund trigger failed');
        }
      }

      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, 'cancelled', $3, $4)`,
        [id, currentStatus, authUser.userId, reason]
      );

      // Release auto-lock on caterer_availability
      await pgPool.query(
        'DELETE FROM caterer_svc.caterer_availability WHERE booking_id = $1 AND auto_locked = TRUE',
        [id]
      );

      // Enqueue Outbox event: booking_cancelled -> other party
      await enqueueOutboxNotification('booking_cancelled', {
        bookingId: id,
        customerId: row.customer_id,
        catererOwnerId: row.caterer_owner_id,
        cancelledBy: effectiveRole,
        eventDate: row.event_date,
        refundINR: refundPaise > 0 ? `₹${(refundPaise / 100).toLocaleString('en-IN')}` : '₹0',
      });

      // Broadcast real-time NOTIFY 'booking_cancelled' (R2)
      try {
        const realtimeEnvelope = {
          event: 'booking_cancelled',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId: id,
            catererId: row.caterer_id,
            customerId: row.customer_id,
            status: 'cancelled',
            amountPaise: row.total_amount_paise || 0,
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        req.log.warn({ notifyErr }, 'Failed to emit pg_notify for booking_cancelled');
      }

      return reply.send({
        booking: updateRes.rows[0],
        refundAmountPaise: refundPaise,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to cancel booking' });
    }
  });

  // Complete Booking (Caterer/Admin) - OWNERSHIP GUARD
  server.post('/api/bookings/:id/complete', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { authorized, booking } = await assertBookingCatererOwner(id, authUser.userId, authUser.role);
      if (!booking) return reply.status(404).send({ error: 'Booking not found' });
      if (!authorized) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
      }

      const currentStatus = booking.status as BookingStatus;
      if (!canTransitionBooking(currentStatus, 'completed', authUser.role)) {
        return reply.status(400).send({ error: `Cannot transition booking from ${currentStatus} to completed` });
      }

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings 
         SET status = 'completed', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
      );

      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by)
         VALUES ($1, $2, 'completed', $3)`,
        [id, currentStatus, authUser.userId]
      );

      // Enqueue Outbox event: booking_completed -> customer (review prompt)
      const catRes = await pgPool.query('SELECT business_name FROM caterer_svc.caterers WHERE id = $1', [booking.caterer_id]);
      await enqueueOutboxNotification('booking_completed', {
        bookingId: id,
        customerId: booking.customer_id,
        catererName: catRes.rows[0]?.business_name,
        eventDate: booking.event_date,
      });

      return reply.send({ booking: updateRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to complete booking' });
    }
  });

  // Admin: Get all bookings across the platform - STRICT ADMIN GUARD
  server.get('/api/admin/bookings', async (req, reply) => {
    try {
      await checkAndExpireBookings();
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { status } = req.query as { status?: string };
      let sql = `
        SELECT 
          b.id, b.customer_id, b.caterer_id, b.package_id,
          TO_CHAR(b.event_date, 'YYYY-MM-DD') as event_date,
          b.event_time, b.guest_count, b.venue_address, b.city, b.special_requests,
          b.status, b.total_amount_paise, b.commission_pct, b.commission_amount_paise,
          b.payment_type, b.advance_pct, b.amount_paid_paise, b.balance_due_paise,
          b.caterer_note, b.cancelled_by, b.cancel_reason, b.refund_amount_paise,
          b.created_at, b.updated_at,
          c.business_name as caterer_business_name,
          p.name as package_name,
          u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email
        FROM order_svc.bookings b
        LEFT JOIN caterer_svc.caterers c ON b.caterer_id = c.id
        LEFT JOIN caterer_svc.packages p ON b.package_id = p.id
        LEFT JOIN auth_svc.users u ON b.customer_id = u.id
      `;
      const params: any[] = [];
      if (status && status !== 'all') {
        params.push(status);
        sql += ` WHERE b.status = $1`;
      }
      sql += ` ORDER BY b.created_at DESC`;

      const res = await pgPool.query(sql, params);
      const bookings = res.rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email,
        catererId: row.caterer_id,
        catererBusinessName: row.caterer_business_name,
        packageId: row.package_id,
        packageName: row.package_name,
        eventDate: row.event_date,
        eventTime: row.event_time,
        guestCount: row.guest_count,
        venueAddress: row.venue_address,
        city: row.city,
        specialRequests: row.special_requests,
        status: row.status as BookingStatus,
        totalAmountPaise: row.total_amount_paise ? parseInt(row.total_amount_paise, 10) : null,
        commissionPct: row.commission_pct ? parseFloat(row.commission_pct) : null,
        commissionAmountPaise: row.commission_amount_paise ? parseInt(row.commission_amount_paise, 10) : null,
        paymentType: row.payment_type,
        advancePct: row.advance_pct ? parseFloat(row.advance_pct) : null,
        amountPaidPaise: parseInt(row.amount_paid_paise || '0', 10),
        balanceDuePaise: parseInt(row.balance_due_paise || '0', 10),
        catererNote: row.caterer_note,
        cancelledBy: row.cancelled_by,
        cancelReason: row.cancel_reason,
        refundAmountPaise: parseInt(row.refund_amount_paise || '0', 10),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return reply.send({ bookings });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to list admin bookings' });
    }
  });

  // Admin: Cancel booking (dispute resolution) - STRICT ADMIN GUARD
  server.post('/api/admin/bookings/:id/cancel', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { id } = req.params as { id: string };
      const { reason } = (req.body as { reason?: string }) || {};

      const cur = await pgPool.query(
        'SELECT status, caterer_id, TO_CHAR(event_date, \'YYYY-MM-DD\') as event_date, total_amount_paise, amount_paid_paise FROM order_svc.bookings WHERE id = $1',
        [id]
      );
      if (cur.rows.length === 0) return reply.status(404).send({ error: 'Booking not found' });

      const booking = cur.rows[0];
      const currentStatus = booking.status as BookingStatus;

      if (currentStatus === 'completed' || currentStatus === 'cancelled') {
        return reply.status(400).send({ error: `Cannot cancel booking in ${currentStatus} status` });
      }

      // Calculate refund using policy
      const eventDateStr = booking.event_date;
      const amountPaid = parseInt(booking.amount_paid_paise || '0', 10);
      const refundAmountPaise = calculateCancellationRefund(
        amountPaid,
        'caterer', // treat admin intervention with full caterer-side protection
        eventDateStr
      );

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings
         SET status = 'cancelled', cancelled_by = 'admin', cancel_reason = $1, refund_amount_paise = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [reason || 'Cancelled by admin dispute resolution', refundAmountPaise, id]
      );

      // Release auto-locked blackout date
      await pgPool.query(
        'DELETE FROM caterer_svc.caterer_availability WHERE caterer_id = $1 AND unavailable_date = $2 AND auto_locked = true',
        [booking.caterer_id, eventDateStr]
      );

      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by)
         VALUES ($1, $2, 'cancelled', $3)`,
        [id, currentStatus, authUser.userId]
      );

      // Trigger payment gateway refund for customer if amount was paid
      if (refundAmountPaise > 0) {
        const paymentSvcUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004';
        try {
          const internalToken = signInternalToken(
            { userId: authUser.userId, role: 'admin' },
            jwtSecret
          );
          await fetch(`${paymentSvcUrl}/api/payments/internal/refund`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-token': internalToken,
            },
            body: JSON.stringify({
              bookingId: id,
              refundAmountPaise,
              reason: reason || 'Cancelled by admin dispute resolution',
            }),
          });
        } catch (rfErr: any) {
          req.log.warn({ rfErr }, 'Automated admin cancel refund trigger failed');
        }
      }

      // Broadcast real-time NOTIFY 'booking_cancelled' (R2)
      try {
        const realtimeEnvelope = {
          event: 'booking_cancelled',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId: id,
            catererId: booking.caterer_id,
            customerId: booking.customer_id,
            status: 'cancelled',
            amountPaise: booking.total_amount_paise || 0,
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        req.log.warn({ notifyErr }, 'Failed to emit pg_notify for booking_cancelled');
      }

      return reply.send({ success: true, booking: updateRes.rows[0], refundAmountPaise });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to cancel booking via admin' });
    }
  });

  // Admin custom / partial refund endpoint for disputes and quality issues
  server.post('/api/admin/bookings/:id/refund', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { id } = req.params as { id: string };
      const { refundAmountPaise, reason, notes } = (req.body as any) || {};

      if (!refundAmountPaise || typeof refundAmountPaise !== 'number' || refundAmountPaise <= 0) {
        return reply.status(400).send({ error: 'refundAmountPaise must be a positive integer in paise' });
      }

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return reply.status(400).send({ error: 'A valid dispute/refund reason is required' });
      }

      const cur = await pgPool.query(
        'SELECT id, status, customer_id, caterer_id, amount_paid_paise, refund_amount_paise, total_amount_paise FROM order_svc.bookings WHERE id = $1',
        [id]
      );
      if (cur.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = cur.rows[0];
      const amountPaid = booking.amount_paid_paise || 0;
      const prevRefund = booking.refund_amount_paise || 0;
      const maxRefundable = amountPaid - prevRefund;

      if (amountPaid <= 0) {
        return reply.status(400).send({ error: 'Cannot refund a booking with no payments recorded' });
      }

      if (refundAmountPaise > maxRefundable) {
        return reply.status(400).send({
          error: `Requested refund of ₹${refundAmountPaise / 100} exceeds maximum refundable balance of ₹${maxRefundable / 100}`,
          maxRefundablePaise: maxRefundable,
        });
      }

      // Call payment-service internal refund endpoint
      const paymentSvcUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004';
      const internalToken = signInternalToken(
        { userId: authUser.userId, role: 'admin' },
        jwtSecret
      );

      let refundResult: any = null;
      try {
        const rfRes = await fetch(`${paymentSvcUrl}/api/payments/internal/refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-token': internalToken,
          },
          body: JSON.stringify({
            bookingId: id,
            refundAmountPaise,
            reason: `${reason.trim()}${notes ? ` - ${notes.trim()}` : ''}`,
          }),
        });

        if (!rfRes.ok) {
          const errData = await rfRes.json().catch(() => ({}));
          return reply.status(rfRes.status).send({ error: errData.error || 'Payment gateway refund failed' });
        }
        refundResult = await rfRes.json();
      } catch (rfErr: any) {
        req.log.error({ rfErr }, 'Failed to connect to payment service for refund');
        return reply.status(502).send({ error: 'Failed to communicate with payment gateway service' });
      }

      // Record in booking status history
      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, $2, $3, $4)`,
        [
          id,
          booking.status,
          authUser.userId,
          `Admin issued custom refund of ₹${(refundAmountPaise / 100).toLocaleString('en-IN')}. Reason: ${reason}${notes ? ` (${notes})` : ''}`,
        ]
      );

      // Enqueue Outbox notification to customer
      await enqueueOutboxNotification('booking_refunded', {
        bookingId: id,
        customerId: booking.customer_id,
        refundAmountINR: `₹${(refundAmountPaise / 100).toLocaleString('en-IN')}`,
        reason,
      });

      // Fetch fresh updated booking
      const refreshed = await pgPool.query('SELECT * FROM order_svc.bookings WHERE id = $1', [id]);

      return reply.send({
        success: true,
        refundId: refundResult?.refundId,
        refundAmountPaise,
        totalRefundAmountPaise: refreshed.rows[0].refund_amount_paise,
        booking: refreshed.rows[0],
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to issue custom refund' });
    }
  });

  // ==============================================================
  // P1-10 Customer Rebook Path & Rebook Options
  // ==============================================================

  // GET /api/bookings/:id/rebook-options
  server.get('/api/bookings/:id/rebook-options', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { id } = req.params as { id: string };
      const bRes = await pgPool.query(
        'SELECT id, customer_id, caterer_id, city, event_date FROM order_svc.bookings WHERE id = $1',
        [id]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];
      if (authUser.role !== 'admin' && booking.customer_id !== authUser.userId) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this booking' });
      }

      const targetCity = booking.city || 'Tirupati';

      const altRes = await pgPool.query(
        `SELECT c.id, c.business_name, c.city, c.state, c.avg_rating, c.review_count,
                p.id as package_id, p.name as package_name, p.price_per_plate_paise
         FROM caterer_svc.caterers c
         LEFT JOIN caterer_svc.packages p ON p.caterer_id = c.id AND p.is_active = true
         WHERE c.status = 'approved' 
           AND LOWER(c.city) = LOWER($1) 
           AND c.id != $2
         LIMIT 10`,
        [targetCity, booking.caterer_id]
      );

      return reply.send({
        success: true,
        bookingId: id,
        city: targetCity,
        alternatives: altRes.rows,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve rebook options' });
    }
  });

  // POST /api/bookings/:id/rebook
  server.post('/api/bookings/:id/rebook', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { id } = req.params as { id: string };
      const bRes = await pgPool.query('SELECT * FROM order_svc.bookings WHERE id = $1', [id]);

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Original booking not found' });
      }

      const orig = bRes.rows[0];
      if (authUser.role !== 'admin' && orig.customer_id !== authUser.userId) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this booking' });
      }

      // Step 1: Verify original booking was cancelled
      if (orig.status !== 'cancelled') {
        return reply.status(400).send({
          error: `Cannot rebook: original booking was not cancelled (current status: ${orig.status})`,
        });
      }

      const body = (req.body as any) || {};
      const newCatererId = body.catererId || orig.caterer_id;
      const newPackageId = body.packageId || orig.package_id;
      const eventDate = body.eventDate || orig.event_date;
      const eventTime = body.eventTime || orig.event_time;
      const guestCount = parseInt(body.guestCount || orig.guest_count, 10);
      const venueAddress = body.venueAddress || orig.venue_address;
      const city = body.city || orig.city;

      if (!guestCount || isNaN(guestCount) || guestCount <= 0) {
        return reply.status(400).send({ error: 'Valid positive guestCount is required' });
      }

      // Validate eventDate is not in the past (using IST / Asia/Kolkata)
      const todayKolkata = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (eventDate < todayKolkata) {
        return reply.status(400).send({ error: 'Event date cannot be in the past' });
      }

      // Step 2: Verify new caterer is active/approved in the same city
      const catRes = await pgPool.query(
        `SELECT id, status, city, service_areas, business_name, instant_booking_enabled,
                min_guests, max_guests, COALESCE(commission_pct, 15.00) as commission_pct
         FROM caterer_svc.caterers WHERE id = $1`,
        [newCatererId]
      );

      if (catRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Selected caterer not found' });
      }

      const caterer = catRes.rows[0];
      if (caterer.status !== 'approved') {
        return reply.status(400).send({ error: 'Selected caterer is not approved for bookings' });
      }

      // Check city and service areas
      const targetCity = (city || orig.city || '').trim().toLowerCase();
      const catererCity = (caterer.city || '').trim().toLowerCase();
      const serviceAreas = (caterer.service_areas || []).map((a: string) => a.trim().toLowerCase());
      const servesCity =
        !targetCity ||
        targetCity === catererCity ||
        serviceAreas.includes(targetCity);

      if (!servesCity) {
        return reply.status(400).send({
          error: `Selected caterer does not serve ${city || orig.city}. Caterer operates in ${caterer.city}.`,
        });
      }

      // Verify guest count rules if configured
      if (caterer.min_guests && guestCount < caterer.min_guests) {
        return reply.status(400).send({
          error: `Booking requires a minimum of ${caterer.min_guests} guests for ${caterer.business_name || 'this caterer'}.`,
        });
      }
      if (caterer.max_guests && guestCount > caterer.max_guests) {
        return reply.status(400).send({
          error: `Booking exceeds maximum limit of ${caterer.max_guests} guests for ${caterer.business_name || 'this caterer'}.`,
        });
      }

      // Step 3: Recalculate total and commission using new package price and guest count
      let totalAmountPaise = 0;
      let effectiveCustomizedItems = body.customizedItems || orig.customized_items || null;

      if (body.customizedItems && body.customizedItems.length > 0) {
        const itemIds = body.customizedItems.map((i: any) => i.id).filter(Boolean);
        const itemsRes = await pgPool.query(
          `SELECT id, name, category, price_paise, is_veg 
           FROM caterer_svc.menu_items 
           WHERE caterer_id = $1 AND id = ANY($2::uuid[])`,
          [newCatererId, itemIds]
        );
        if (itemsRes.rows.length === 0) {
          return reply.status(400).send({ error: 'None of the selected custom items were found for this caterer.' });
        }
        effectiveCustomizedItems = itemsRes.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          pricePaise: r.price_paise,
          isVeg: r.is_veg,
        }));
        const pricePerPlate = itemsRes.rows.reduce((sum: number, item: any) => sum + item.price_paise, 0);
        totalAmountPaise = pricePerPlate * guestCount;
      } else if (newPackageId) {
        const pkgRes = await pgPool.query(
          'SELECT price_per_plate_paise FROM caterer_svc.packages WHERE id = $1 AND caterer_id = $2',
          [newPackageId, newCatererId]
        );
        if (pkgRes.rows.length === 0) {
          return reply.status(404).send({ error: 'Selected package not found for this caterer' });
        }
        const pricePerPlate = pkgRes.rows[0].price_per_plate_paise;
        totalAmountPaise = pricePerPlate * guestCount;
      } else {
        return reply.status(400).send({ error: 'Either packageId or customizedItems must be provided for rebooking' });
      }

      const commissionPct = parseFloat(caterer.commission_pct || '15.00');
      const commissionAmountPaise = Math.round((totalAmountPaise * commissionPct) / 100);
      const bookingMode = caterer.instant_booking_enabled === true ? 'instant' : 'on_request';

      // Step 4: Create new booking row
      const newBooking = await pgPool.query(
        `INSERT INTO order_svc.bookings (
           customer_id, caterer_id, package_id, event_date, event_time,
           guest_count, venue_address, city, state, pincode, special_requests,
           status, booking_mode, total_amount_paise, commission_pct, commission_amount_paise,
           customized_items, custom_combo_name, rebooked_from_booking_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'requested', $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          orig.customer_id,
          newCatererId,
          newPackageId || null,
          eventDate,
          eventTime,
          guestCount,
          venueAddress,
          city || orig.city || 'Tirupati',
          body.state || orig.state || 'Andhra Pradesh',
          body.pincode || orig.pincode || null,
          body.specialRequests !== undefined ? body.specialRequests : orig.special_requests,
          bookingMode,
          totalAmountPaise,
          commissionPct,
          commissionAmountPaise,
          effectiveCustomizedItems ? JSON.stringify(effectiveCustomizedItems) : null,
          body.customComboName || (newPackageId ? null : 'Rebooked Custom Feast'),
          id,
        ]
      );

      const booking = newBooking.rows[0];

      // Insert audit history
      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, NULL, 'requested', $2, $3)`,
        [booking.id, authUser.userId, `Rebooked from cancelled booking ${id}`]
      );

      // Enqueue Outbox notification to caterer
      const catererOwnerRes = await pgPool.query(
        `SELECT c.owner_id, c.business_name, u.phone 
         FROM caterer_svc.caterers c
         JOIN auth_svc.users u ON c.owner_id = u.id
         WHERE c.id = $1`,
        [newCatererId]
      );
      const catererOwner = catererOwnerRes.rows[0];
      await enqueueOutboxNotification('booking_requested', {
        bookingId: booking.id,
        customerId: orig.customer_id,
        catererId: newCatererId,
        catererOwnerId: catererOwner?.owner_id,
        catererPhone: catererOwner?.phone,
        catererName: catererOwner?.business_name,
        eventDate,
        guestCount,
      });

      // Broadcast real-time NOTIFY 'booking_requested' (R2)
      try {
        const realtimeEnvelope = {
          event: 'booking_requested',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId: booking.id,
            catererId: newCatererId,
            customerId: orig.customer_id,
            status: 'requested',
            amountPaise: totalAmountPaise,
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        req.log.warn({ notifyErr }, 'Failed to emit pg_notify for rebooked booking');
      }

      return reply.status(201).send({
        success: true,
        booking,
        rebookedFrom: id,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to rebook' });
    }
  });

  // ==============================================================
  // P1-12 Dispute & Complaint Workflow
  // ==============================================================

  // POST /api/bookings/:id/disputes (Customer files dispute)
  server.post('/api/bookings/:id/disputes', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { id } = req.params as { id: string };
      const bRes = await pgPool.query('SELECT * FROM order_svc.bookings WHERE id = $1', [id]);

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];
      if (authUser.role !== 'admin' && booking.customer_id !== authUser.userId) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this booking' });
      }

      // Disputes can only be filed on paid or completed bookings
      if (booking.status !== 'paid' && booking.status !== 'completed') {
        return reply.status(400).send({ error: `Disputes can only be filed on confirmed paid or completed bookings (current: ${booking.status})` });
      }

      // Disputes must be filed within 7 days of event date/completion
      if (booking.event_date) {
        const eventDate = new Date(booking.event_date);
        const now = new Date();
        const diffMs = now.getTime() - eventDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
          return reply.status(400).send({ error: 'Disputes must be filed within 7 days of event completion' });
        }
      }

      // Check existing open dispute
      const existingDispute = await pgPool.query(
        `SELECT id FROM order_svc.disputes WHERE booking_id = $1 AND status IN ('open', 'under_review', 'under_investigation')`,
        [id]
      );
      if (existingDispute.rows.length > 0) {
        return reply.status(400).send({ error: 'An active dispute is already open for this booking' });
      }

      const body = (req.body as any) || {};
      const { category, description, evidenceUrls, refundRequestedPaise, refundAmountPaise } = body;

      const validCategories = ['food_quality', 'tardiness', 'hygiene', 'service_shortage', 'other'];
      if (!category || !validCategories.includes(category)) {
        return reply.status(400).send({ error: 'Invalid dispute category' });
      }

      if (!description || typeof description !== 'string' || !description.trim()) {
        return reply.status(400).send({ error: 'Dispute description is required' });
      }

      const requestedRefund = refundRequestedPaise || refundAmountPaise || 0;

      // Automatic settlement hold in pay_svc.caterer_settlements
      let settlementHoldId: string | null = null;
      const sRes = await pgPool.query(
        `SELECT id, status FROM pay_svc.caterer_settlements WHERE booking_id = $1`,
        [id]
      );
      if (sRes.rows.length > 0) {
        const s = sRes.rows[0];
        settlementHoldId = s.id;
        if (s.status === 'pending' || s.status === 'processing') {
          await pgPool.query(
            `UPDATE pay_svc.caterer_settlements SET status = 'held', updated_at = NOW() WHERE id = $1`,
            [s.id]
          );
        }
      }

      const dRes = await pgPool.query(
        `INSERT INTO order_svc.disputes (
           booking_id, customer_id, caterer_id, category, description,
           evidence_urls, refund_amount_paise, settlement_hold_id, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
         RETURNING *`,
        [
          id,
          booking.customer_id,
          booking.caterer_id,
          category,
          description.trim(),
          evidenceUrls || [],
          requestedRefund,
          settlementHoldId,
        ]
      );

      const dispute = dRes.rows[0];

      // Enqueue Outbox notification
      await enqueueOutboxNotification('dispute_filed', {
        disputeId: dispute.id,
        bookingId: id,
        customerId: booking.customer_id,
        catererId: booking.caterer_id,
        category,
      });

      // Real-time NOTIFY 'dispute_filed'
      try {
        const realtimeEnvelope = {
          event: 'dispute_filed',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId: id,
            disputeId: dispute.id,
            customerId: booking.customer_id,
            catererId: booking.caterer_id,
            status: 'open',
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        // ignore
      }

      return reply.status(201).send({
        success: true,
        disputeId: dispute.id,
        status: 'open',
        holdSettlement: Boolean(settlementHoldId),
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to file dispute' });
    }
  });

  // GET /api/bookings/:id/disputes
  server.get('/api/bookings/:id/disputes', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { id } = req.params as { id: string };
      const dRes = await pgPool.query(
        `SELECT * FROM order_svc.disputes WHERE booking_id = $1 ORDER BY created_at DESC`,
        [id]
      );
      return reply.send({ disputes: dRes.rows });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch disputes' });
    }
  });

  // GET /api/admin/disputes (Admin list all disputes)
  server.get('/api/admin/disputes', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const dRes = await pgPool.query(
        `SELECT d.*, c.business_name, u.full_name as customer_name
         FROM order_svc.disputes d
         JOIN caterer_svc.caterers c ON d.caterer_id = c.id
         JOIN auth_svc.users u ON d.customer_id = u.id
         ORDER BY d.created_at DESC LIMIT 100`
      );
      return reply.send({ disputes: dRes.rows });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch admin disputes' });
    }
  });

  // POST /api/admin/disputes/:id/resolve (Admin resolves dispute)
  server.post('/api/admin/disputes/:id/resolve', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { id } = req.params as { id: string };
      const dRes = await pgPool.query('SELECT * FROM order_svc.disputes WHERE id = $1', [id]);

      if (dRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Dispute not found' });
      }

      const dispute = dRes.rows[0];
      const body = (req.body as any) || {};
      const { resolution, resolutionNotes, refundPaise, refundAmountPaise } = body;

      const validResolutions = ['refund_customer', 'dismiss', 'split_adjustment', 'caterer_penalized', 'other'];
      if (!resolution || !validResolutions.includes(resolution)) {
        return reply.status(400).send({ error: 'Invalid dispute resolution' });
      }

      const effectiveRefund = refundPaise || refundAmountPaise || 0;
      let settlementStatus = 'pending';

      if (resolution === 'dismiss') {
        // Release settlement hold
        if (dispute.settlement_hold_id) {
          await pgPool.query(
            `UPDATE pay_svc.caterer_settlements SET status = 'pending', updated_at = NOW() WHERE id = $1`,
            [dispute.settlement_hold_id]
          );
        }
        settlementStatus = 'pending';
      } else if (resolution === 'refund_customer' || resolution === 'split_adjustment') {
        if (effectiveRefund > 0) {
          // Trigger internal payment refund
          const paymentSvcUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004';
          try {
            const internalToken = signInternalToken({ userId: authUser.userId, role: 'admin' }, jwtSecret);
            await fetch(`${paymentSvcUrl}/api/payments/internal/refund`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-token': internalToken,
              },
              body: JSON.stringify({
                bookingId: dispute.booking_id,
                refundAmountPaise: effectiveRefund,
                reason: `Dispute resolution (${resolution}): ${resolutionNotes || 'Customer refund'}`,
              }),
            });
          } catch (rfErr) {
            req.log.warn({ rfErr }, 'Failed to trigger internal refund for dispute');
          }
        }
        if (dispute.settlement_hold_id) {
          await pgPool.query(
            `UPDATE pay_svc.caterer_settlements SET status = 'pending', updated_at = NOW() WHERE id = $1`,
            [dispute.settlement_hold_id]
          );
        }
        settlementStatus = 'pending';
      }

      const updateRes = await pgPool.query(
        `UPDATE order_svc.disputes
         SET status = 'resolved',
             resolution = $1,
             resolution_notes = $2,
             refund_amount_paise = $3,
             resolved_by = $4,
             resolved_at = NOW(),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [resolution, resolutionNotes || null, effectiveRefund, authUser.userId, id]
      );

      // Record in audit_svc.admin_audit_logs
      await pgPool.query(
        `INSERT INTO audit_svc.admin_audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, 'resolve_dispute', 'dispute', $2, $3, $4)`,
        [
          authUser.userId,
          id,
          JSON.stringify({ resolution, resolutionNotes, refundPaise: effectiveRefund, bookingId: dispute.booking_id }),
          req.ip || null,
        ]
      );

      return reply.send({
        success: true,
        status: 'resolved',
        settlementStatus,
        dispute: updateRes.rows[0],
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to resolve dispute' });
    }
  });

  // GET /api/bookings/:id/invoice (P1-6) - Delegate to Payment Service Hardened Invoicing Engine
  server.get('/api/bookings/:id/invoice', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { id } = req.params as { id: string };
      const paymentSvcUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004';
      const internalToken = signInternalToken(
        { userId: authUser.userId, role: authUser.role },
        jwtSecret
      );

      const forwardHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'x-internal-token': internalToken,
        'x-user-id': authUser.userId,
        'x-user-role': authUser.role,
      };
      if (req.headers.authorization) {
        forwardHeaders['authorization'] = req.headers.authorization as string;
      }

      const upstreamResp = await fetch(`${paymentSvcUrl}/api/bookings/${id}/invoice`, {
        method: 'GET',
        headers: forwardHeaders,
      });

      const data = await upstreamResp.json();
      return reply.status(upstreamResp.status).send(data);
    } catch (err: any) {
      req.log.error(err, 'Failed to delegate invoice request to payment service');
      return reply.status(500).send({ error: 'Failed to retrieve invoice' });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const app = buildBookingServer();
  const PORT = parseInt(process.env.BOOKING_PORT || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : '4003'), 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Booking & Order Service listening at ${address}`);
  });
}
