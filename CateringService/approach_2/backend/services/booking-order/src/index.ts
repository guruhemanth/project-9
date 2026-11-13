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
} from '@caterconnect/shared';
import { enqueueOutboxNotification } from './outbox';

export function buildBookingServer() {
  const env = validateEnv(createDbEnvSchema(), process.env);
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576,
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });

  registerCentralizedErrorHandler(server, 'booking-order-service');

  server.addHook('onClose', async () => {
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

      const { catererId, packageId, eventDate, eventTime, guestCount, venueAddress, city, state, pincode, specialRequests } =
        parseResult.data;

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
      const catRuleRes = await pgPool.query(
        'SELECT min_guests, max_guests, business_name FROM caterer_svc.caterers WHERE id = $1',
        [catererId]
      );

      if (catRuleRes.rows.length > 0) {
        const { min_guests, max_guests, business_name } = catRuleRes.rows[0];
        if (min_guests && guestCount < min_guests) {
          return reply.status(400).send({
            error: `Booking requires a minimum of ${min_guests} guests for ${business_name || 'this caterer'}.`,
          });
        }
        if (max_guests && guestCount > max_guests) {
          return reply.status(400).send({
            error: `Booking exceeds maximum limit of ${max_guests} guests for ${business_name || 'this caterer'}.`,
          });
        }
      }

      // Verify package price to calculate total_amount_paise
      const pkgRes = await pgPool.query(
        'SELECT price_per_plate_paise FROM caterer_svc.packages WHERE id = $1 AND caterer_id = $2',
        [packageId, catererId]
      );

      if (pkgRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Package not found for this caterer' });
      }

      const pricePerPlate = pkgRes.rows[0].price_per_plate_paise;
      const totalAmountPaise = pricePerPlate * guestCount;

      const insertRes = await pgPool.query(
        `INSERT INTO order_svc.bookings 
         (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, pincode, special_requests, total_amount_paise, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'requested')
         RETURNING *`,
        [
          customerId,
          catererId,
          packageId,
          eventDate,
          eventTime,
          guestCount,
          venueAddress,
          city,
          state || 'Andhra Pradesh',
          pincode || null,
          specialRequests || null,
          totalAmountPaise,
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

      return reply.status(201).send({ booking });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to create booking' });
    }
  });

  // Get customer bookings
  server.get('/api/bookings/customer', async (req, reply) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }

    const customerId = authUser.userId;

    const res = await pgPool.query(
      `SELECT b.*, c.business_name, p.name as package_name
       FROM order_svc.bookings b
       JOIN caterer_svc.caterers c ON b.caterer_id = c.id
       JOIN caterer_svc.packages p ON b.package_id = p.id
       WHERE b.customer_id = $1
       ORDER BY b.created_at DESC`,
      [customerId]
    );

    return reply.send({ bookings: res.rows });
  });

  // Get caterer incoming bookings
  server.get('/api/bookings/caterer/:catererId', async (req, reply) => {
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
      `SELECT b.*, p.name as package_name,
              u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email
       FROM order_svc.bookings b
       JOIN caterer_svc.packages p ON b.package_id = p.id
       LEFT JOIN auth_svc.users u ON b.customer_id = u.id
       WHERE b.caterer_id = $1
       ORDER BY b.event_date ASC, b.created_at DESC`,
      [catererId]
    );

    return reply.send({ bookings: res.rows });
  });

  // Get single booking by ID (Must be customer, caterer owner, or admin)
  server.get('/api/bookings/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }

    const res = await pgPool.query(
      `SELECT b.*, c.business_name, c.owner_id as caterer_owner_id, p.name as package_name,
              u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email
       FROM order_svc.bookings b
       JOIN caterer_svc.caterers c ON b.caterer_id = c.id
       JOIN caterer_svc.packages p ON b.package_id = p.id
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

      // Auto-lock the date in caterer_availability
      await pgPool.query(
        `INSERT INTO caterer_svc.caterer_availability (caterer_id, unavailable_date, reason, auto_locked, booking_id)
         VALUES ($1, $2, 'Booked via CaterConnect', TRUE, $3)
         ON CONFLICT (caterer_id, unavailable_date)
         DO UPDATE SET auto_locked = TRUE, booking_id = EXCLUDED.booking_id, reason = 'Booked via CaterConnect'`,
        [caterer_id, event_date, id]
      );

      const totalPaise = booking.total_amount_paise || 0;
      const commissionPaise = Math.round(totalPaise * 0.15);

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings 
         SET status = 'accepted', 
             commission_pct = 15.00, 
             commission_amount_paise = $1,
             caterer_note = $2,
             updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [commissionPaise, catererNote, id]
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
        `SELECT b.status, b.event_date, b.amount_paid_paise, b.customer_id, c.owner_id as caterer_owner_id
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
      if (currentStatus === 'paid' && row.amount_paid_paise > 0) {
        const eventDateStr = new Date(row.event_date).toISOString().split('T')[0];
        refundPaise = calculateCancellationRefund(row.amount_paid_paise, effectiveRole, eventDateStr);
      }

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings 
         SET status = 'cancelled', 
             cancelled_by = $1, 
             cancel_reason = $2, 
             refund_amount_paise = $3,
             updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [effectiveRole, reason || 'User requested cancellation', refundPaise, id]
      );

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

      return reply.send({ success: true, booking: updateRes.rows[0], refundAmountPaise });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to cancel booking via admin' });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildBookingServer();
  const PORT = parseInt(process.env.PORT || '4003', 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Booking & Order Service listening at ${address}`);
  });
}
