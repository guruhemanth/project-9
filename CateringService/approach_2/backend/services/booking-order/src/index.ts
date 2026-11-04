import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { pgPool } from './db';
import {
  bookingRequestSchema,
  BookingStatus,
  canTransitionBooking,
  calculateCancellationRefund,
} from '@caterconnect/shared';

export function buildBookingServer() {
  const server = Fastify({ logger: false });

  server.register(fastifyCors, { origin: true });

  // Health check
  server.get('/health', async () => ({ status: 'ok', service: 'booking-order-service' }));

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

      const customerId = (req.headers['x-user-id'] as string) || (req.body as any).customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Missing customer identity' });
      }

      const { catererId, packageId, eventDate, eventTime, guestCount, venueAddress, city, specialRequests } =
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
         (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, special_requests, total_amount_paise, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'requested')
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

      return reply.status(201).send({ booking });
    } catch (err: any) {
      console.error('POST /api/bookings error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Get customer bookings
  server.get('/api/bookings/customer', async (req, reply) => {
    const customerId = req.headers['x-user-id'] as string;
    if (!customerId) {
      return reply.status(401).send({ error: 'Missing customer identity' });
    }

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

  // Get caterer bookings
  server.get('/api/bookings/caterer/:catererId', async (req, reply) => {
    const { catererId } = req.params as { catererId: string };

    const res = await pgPool.query(
      `SELECT b.*, p.name as package_name
       FROM order_svc.bookings b
       JOIN caterer_svc.packages p ON b.package_id = p.id
       WHERE b.caterer_id = $1
       ORDER BY b.event_date ASC, b.created_at DESC`,
      [catererId]
    );

    return reply.send({ bookings: res.rows });
  });

  // Get booking details by ID
  server.get('/api/bookings/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const res = await pgPool.query(
      `SELECT b.*, c.business_name, c.phone as caterer_phone, p.name as package_name
       FROM order_svc.bookings b
       JOIN caterer_svc.caterers c ON b.caterer_id = c.id
       JOIN caterer_svc.packages p ON b.package_id = p.id
       WHERE b.id = $1 LIMIT 1`,
      [id]
    );

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Booking not found' });
    }

    return reply.send({ booking: res.rows[0] });
  });

  // Caterer Accepts Booking (calculates & locks 15% platform commission)
  server.post('/api/bookings/:id/accept', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const catererNote = (req.body as any)?.catererNote || null;
      const actorId = (req.headers['x-user-id'] as string) || null;
      const actorRole = ((req.headers['x-user-role'] as string) || 'caterer') as any;

      const cur = await pgPool.query('SELECT caterer_id, event_date, status, total_amount_paise FROM order_svc.bookings WHERE id = $1', [id]);
      if (cur.rows.length === 0) return reply.status(404).send({ error: 'Booking not found' });

      const currentStatus = cur.rows[0].status as BookingStatus;
      if (!canTransitionBooking(currentStatus, 'accepted', actorRole)) {
        return reply.status(400).send({ error: `Cannot transition booking from ${currentStatus} to accepted` });
      }

      const { caterer_id, event_date } = cur.rows[0];

      // Auto-lock the date in caterer_availability
      await pgPool.query(
        `INSERT INTO caterer_svc.caterer_availability (caterer_id, unavailable_date, reason, auto_locked, booking_id)
         VALUES ($1, $2, 'Booked via CaterConnect', TRUE, $3)
         ON CONFLICT (caterer_id, unavailable_date)
         DO UPDATE SET auto_locked = TRUE, booking_id = EXCLUDED.booking_id, reason = 'Booked via CaterConnect'`,
        [caterer_id, event_date, id]
      );

      const totalPaise = cur.rows[0].total_amount_paise || 0;
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
        [id, currentStatus, actorId, catererNote]
      );

      return reply.send({ booking: updateRes.rows[0] });
    } catch (err: any) {
      console.error('POST /accept error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Caterer Rejects Booking
  server.post('/api/bookings/:id/reject', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const reason = (req.body as any)?.reason || 'Unavailable on selected date';
      const actorId = (req.headers['x-user-id'] as string) || null;
      const actorRole = ((req.headers['x-user-role'] as string) || 'caterer') as any;

      const cur = await pgPool.query('SELECT status FROM order_svc.bookings WHERE id = $1', [id]);
      if (cur.rows.length === 0) return reply.status(404).send({ error: 'Booking not found' });

      const currentStatus = cur.rows[0].status as BookingStatus;
      if (!canTransitionBooking(currentStatus, 'rejected', actorRole)) {
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
        [id, currentStatus, actorId, reason]
      );

      return reply.send({ booking: updateRes.rows[0] });
    } catch (err: any) {
      console.error('POST /reject error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Cancel Booking (with tiered refund calculation)
  server.post('/api/bookings/:id/cancel', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { reason } = (req.body as any) || {};
      const actorRole = ((req.headers['x-user-role'] as string) || 'customer') as any;
      const actorId = (req.headers['x-user-id'] as string) || null;

      const cur = await pgPool.query(
        'SELECT status, event_date, amount_paid_paise FROM order_svc.bookings WHERE id = $1',
        [id]
      );
      if (cur.rows.length === 0) return reply.status(404).send({ error: 'Booking not found' });

      const row = cur.rows[0];
      const currentStatus = row.status as BookingStatus;

      if (!canTransitionBooking(currentStatus, 'cancelled', actorRole)) {
        return reply.status(400).send({ error: `Cannot transition booking from ${currentStatus} to cancelled` });
      }

      let refundPaise = 0;
      if (currentStatus === 'paid' && row.amount_paid_paise > 0) {
        const eventDateStr = new Date(row.event_date).toISOString().split('T')[0];
        refundPaise = calculateCancellationRefund(row.amount_paid_paise, actorRole, eventDateStr);
      }

      const updateRes = await pgPool.query(
        `UPDATE order_svc.bookings 
         SET status = 'cancelled', 
             cancelled_by = $1, 
             cancel_reason = $2, 
             refund_amount_paise = $3,
             updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [actorRole, reason || 'User requested cancellation', refundPaise, id]
      );

      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, 'cancelled', $3, $4)`,
        [id, currentStatus, actorId, reason]
      );

      // Release auto-lock on caterer_availability
      await pgPool.query(
        'DELETE FROM caterer_svc.caterer_availability WHERE booking_id = $1 AND auto_locked = TRUE',
        [id]
      );

      return reply.send({
        booking: updateRes.rows[0],
        refundAmountPaise: refundPaise,
      });
    } catch (err: any) {
      console.error('POST /cancel error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Complete Booking (Caterer/Admin)
  server.post('/api/bookings/:id/complete', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const actorRole = ((req.headers['x-user-role'] as string) || 'caterer') as any;
      const actorId = (req.headers['x-user-id'] as string) || null;

      const cur = await pgPool.query('SELECT status FROM order_svc.bookings WHERE id = $1', [id]);
      if (cur.rows.length === 0) return reply.status(404).send({ error: 'Booking not found' });

      const currentStatus = cur.rows[0].status as BookingStatus;
      if (!canTransitionBooking(currentStatus, 'completed', actorRole)) {
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
        [id, currentStatus, actorId]
      );

      return reply.send({ booking: updateRes.rows[0] });
    } catch (err: any) {
      console.error('POST /complete error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Admin: Get all bookings across the platform
  server.get('/api/admin/bookings', async (req, reply) => {
    try {
      const { status } = req.query as { status?: string };
      let sql = `
        SELECT 
          b.id, b.customer_id, b.caterer_id, b.package_id,
          TO_CHAR(b.event_date, 'YYYY-MM-DD') as event_date,
          b.event_time, b.guest_count, b.venue_address, b.city,
          b.special_requests, b.status, b.total_amount_paise,
          b.commission_pct, b.commission_amount_paise, b.payment_type,
          b.advance_pct, b.amount_paid_paise, b.balance_due_paise,
          b.caterer_note, b.cancelled_by, b.cancel_reason, b.refund_amount_paise,
          b.created_at, b.updated_at,
          c.business_name as caterer_business_name,
          p.name as package_name,
          u.full_name as customer_name,
          u.phone as customer_phone,
          u.email as customer_email
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
      console.error('GET /api/admin/bookings error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Admin: Cancel booking (dispute resolution)
  server.post('/api/admin/bookings/:id/cancel', async (req, reply) => {
    try {
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
      const totalAmount = parseInt(booking.total_amount_paise || '0', 10);
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

      const adminUserId = (req.headers['x-user-id'] as string) || null;

      await pgPool.query(
        `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, changed_by)
         VALUES ($1, $2, 'cancelled', $3)`,
        [id, currentStatus, adminUserId]
      );

      return reply.send({ success: true, booking: updateRes.rows[0], refundAmountPaise });
    } catch (err: any) {
      console.error('POST /api/admin/bookings/:id/cancel error:', err);
      return reply.status(500).send({ error: err.message });
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
