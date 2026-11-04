import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { pgPool } from './db';
import {
  createOrderSchema,
  disburseSettlementSchema,
  PaymentOption,
  validateEnv,
  createPaymentEnvSchema,
  buildCorsOptions,
  registerCentralizedErrorHandler,
  loggerRedactionConfig,
} from '@caterconnect/shared';

export function buildPaymentServer() {
  const env = validateEnv(createPaymentEnvSchema(), process.env);
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576,
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });

  registerCentralizedErrorHandler(server, 'payment-service');

  server.addHook('onClose', async () => {
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  server.register(fastifyHelmet, { contentSecurityPolicy: false });
  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));

  const razorpayKeyId = env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = env.RAZORPAY_KEY_SECRET;
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

  let razorpayInstance: Razorpay | null = null;
  try {
    razorpayInstance = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });
  } catch (err) {
    console.warn('Razorpay client initialization warning:', err);
  }

  // Health & Readiness checks
  server.get('/health', async () => ({ status: 'ok', service: 'payment-service' }));
  server.get('/ready', async (_req, reply) => {
    try {
      await pgPool.query('SELECT 1');
      return { status: 'ready', database: 'connected', service: 'payment-service' };
    } catch (err: any) {
      return reply.status(503).send({ status: 'not_ready', database: 'disconnected', service: 'payment-service' });
    }
  });

  // Create Razorpay Order with Dual Options: Option 1 (100% Full) or Option 2 (25% Advance)
  server.post('/api/payments/create-order', async (req, reply) => {
    try {
      const parseResult = createOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { bookingId, paymentOption, advancePct } = parseResult.data;

      // Query booking details
      const bRes = await pgPool.query(
        'SELECT id, status, total_amount_paise FROM order_svc.bookings WHERE id = $1',
        [bookingId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];
      if (booking.status !== 'accepted') {
        return reply.status(400).send({
          error: `Cannot initiate payment for booking in '${booking.status}' status. Must be 'accepted'.`,
        });
      }

      const totalPaise = booking.total_amount_paise;
      let orderAmountPaise = 0;
      let pct = 100;

      if (paymentOption === 'advance') {
        pct = advancePct || 25;
        orderAmountPaise = Math.round((totalPaise * pct) / 100);
      } else {
        // Full payment
        orderAmountPaise = totalPaise;
      }

      // Generate order ID via Razorpay (production must create live order or fail fast)
      let rzpOrderId = '';

      if (env.NODE_ENV === 'production') {
        if (!razorpayInstance) {
          return reply.status(502).send({
            statusCode: 502,
            error: 'Bad Gateway',
            message: 'Razorpay payment client initialization failed.',
          });
        }
        try {
          const rzpOrder = await razorpayInstance.orders.create({
            amount: orderAmountPaise,
            currency: 'INR',
            receipt: bookingId.substring(0, 40),
            notes: {
              bookingId,
              paymentOption,
              advancePct: pct.toString(),
            },
          });
          rzpOrderId = rzpOrder.id;
        } catch (gatewayErr: any) {
          req.log.error({ gatewayErr }, 'Razorpay live order creation failed');
          return reply.status(502).send({
            statusCode: 502,
            error: 'Bad Gateway',
            message: 'Failed to create payment order with payment gateway.',
          });
        }
      } else {
        // Development or test environment mock fallback
        if (razorpayInstance && !razorpayKeyId.startsWith('test_rzp')) {
          try {
            const rzpOrder = await razorpayInstance.orders.create({
              amount: orderAmountPaise,
              currency: 'INR',
              receipt: bookingId.substring(0, 40),
              notes: {
                bookingId,
                paymentOption,
                advancePct: pct.toString(),
              },
            });
            rzpOrderId = rzpOrder.id;
          } catch {
            rzpOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          }
        } else {
          rzpOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        }
      }

      // Record created payment in pay_svc.payments
      const payRes = await pgPool.query(
        `INSERT INTO pay_svc.payments 
         (booking_id, razorpay_order_id, amount_paise, currency, status, payment_type)
         VALUES ($1, $2, $3, 'INR', 'created', $4)
         RETURNING *`,
        [bookingId, rzpOrderId, orderAmountPaise, paymentOption]
      );

      // Update booking payment option details
      await pgPool.query(
        `UPDATE order_svc.bookings
         SET payment_type = $1, advance_pct = $2
         WHERE id = $3`,
        [paymentOption, pct, bookingId]
      );

      return reply.status(201).send({
        orderId: rzpOrderId,
        amountPaise: orderAmountPaise,
        currency: 'INR',
        paymentOption,
        advancePct: pct,
        keyId: razorpayKeyId,
        payment: payRes.rows[0],
      });
    } catch (err: any) {
      console.error('POST /create-order error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Razorpay Webhook Handler
  // Verifies HMAC SHA-256 signature using timing-safe comparison and idempotently updates booking to 'paid'
  server.post('/api/payments/webhook', async (req, reply) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      if (!signature) {
        return reply.status(400).send({ error: 'Missing x-razorpay-signature header' });
      }

      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      // Verify HMAC-SHA256 signature with timingSafeEqual to prevent timing attacks
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signature, 'utf8');
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return reply.status(400).send({ error: 'Invalid Razorpay webhook signature' });
      }

      const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (event.event === 'order.paid' || event.event === 'payment.captured') {
        const paymentEntity = event.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;
        const amountPaise = paymentEntity?.amount;

        if (orderId) {
          // Find payment record
          const pRes = await pgPool.query(
            'SELECT * FROM pay_svc.payments WHERE razorpay_order_id = $1 LIMIT 1',
            [orderId]
          );

          if (pRes.rows.length > 0) {
            const payRow = pRes.rows[0];

            // Idempotency: If this payment was already captured, acknowledge immediately without duplicate processing
            if (payRow.status === 'captured') {
              return reply.send({ received: true, idempotent: true });
            }

            const bookingId = payRow.booking_id;

            // Update payment record to captured
            await pgPool.query(
              `UPDATE pay_svc.payments 
               SET status = 'captured', razorpay_payment_id = $1, raw_payload = $2, updated_at = NOW()
               WHERE id = $3`,
              [paymentId || `pay_${Date.now()}`, event, payRow.id]
            );

            // Fetch booking to calculate balance
            const bRes = await pgPool.query(
              'SELECT total_amount_paise FROM order_svc.bookings WHERE id = $1',
              [bookingId]
            );

            if (bRes.rows.length > 0) {
              const totalAmount = bRes.rows[0].total_amount_paise || 0;
              const balanceDue = Math.max(0, totalAmount - amountPaise);

              // Update booking to 'paid'
              await pgPool.query(
                `UPDATE order_svc.bookings 
                 SET status = 'paid', 
                     amount_paid_paise = $1, 
                     balance_due_paise = $2, 
                     updated_at = NOW()
                 WHERE id = $3`,
                [amountPaise, balanceDue, bookingId]
              );

              // Record in booking audit history
              await pgPool.query(
                `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, note)
                 VALUES ($1, 'accepted', 'paid', $2)`,
                [bookingId, `Payment captured via Razorpay ID: ${paymentId}`]
              );
            }
          }
        }
      }

      return reply.send({ received: true });
    } catch (err: any) {
      console.error('Webhook error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Generate settlement ledger entry for a completed booking
  server.post('/api/payments/settlements/generate', async (req, reply) => {
    try {
      const { bookingId } = (req.body as any) || {};
      if (!bookingId) {
        return reply.status(400).send({ error: 'bookingId is required' });
      }

      // Query booking details
      const bRes = await pgPool.query(
        'SELECT id, caterer_id, status, total_amount_paise, commission_pct FROM order_svc.bookings WHERE id = $1',
        [bookingId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];
      const grossPaise = booking.total_amount_paise || 0;
      const commissionPct = parseFloat(booking.commission_pct || '15.00');
      const commissionPaise = Math.round((grossPaise * commissionPct) / 100);
      const netPayoutPaise = grossPaise - commissionPaise;

      const sRes = await pgPool.query(
        `INSERT INTO pay_svc.caterer_settlements
         (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (booking_id) DO UPDATE 
         SET gross_amount_paise = EXCLUDED.gross_amount_paise,
             commission_amount_paise = EXCLUDED.commission_amount_paise,
             net_payout_paise = EXCLUDED.net_payout_paise,
             updated_at = NOW()
         RETURNING *`,
        [booking.id, booking.caterer_id, grossPaise, commissionPct, commissionPaise, netPayoutPaise]
      );

      return reply.status(201).send({ settlement: sRes.rows[0] });
    } catch (err: any) {
      console.error('POST /settlements/generate error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Get caterer's financial settlement ledger & totals
  server.get('/api/payments/settlements/caterer/:catererId', async (req, reply) => {
    try {
      const { catererId } = req.params as { catererId: string };

      const settlementsRes = await pgPool.query(
        `SELECT s.*, b.event_date
         FROM pay_svc.caterer_settlements s
         JOIN order_svc.bookings b ON s.booking_id = b.id
         WHERE s.caterer_id = $1
         ORDER BY s.created_at DESC`,
        [catererId]
      );

      // Compute aggregates
      let totalGrossPaise = 0;
      let totalCommissionPaise = 0;
      let totalNetPayoutPaise = 0;
      let totalDisbursedPaise = 0;
      let pendingDisbursementPaise = 0;

      const settlements = settlementsRes.rows.map((row) => {
        totalGrossPaise += row.gross_amount_paise;
        totalCommissionPaise += row.commission_amount_paise;
        totalNetPayoutPaise += row.net_payout_paise;

        if (row.status === 'settled') {
          totalDisbursedPaise += row.net_payout_paise;
        } else {
          pendingDisbursementPaise += row.net_payout_paise;
        }

        return {
          id: row.id,
          bookingId: row.booking_id,
          eventDate: row.event_date,
          grossAmountPaise: row.gross_amount_paise,
          commissionPct: parseFloat(row.commission_pct),
          commissionAmountPaise: row.commission_amount_paise,
          netPayoutPaise: row.net_payout_paise,
          status: row.status,
          utrReference: row.utr_reference,
          settledAt: row.settled_at,
          createdAt: row.created_at,
        };
      });

      return reply.send({
        summary: {
          totalGrossPaise,
          totalCommissionPaise,
          totalNetPayoutPaise,
          totalDisbursedPaise,
          pendingDisbursementPaise,
          completedBookingsCount: settlements.length,
        },
        settlements,
      });
    } catch (err: any) {
      console.error('GET /settlements/caterer error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Admin marks settlement as disbursed with bank UTR reference
  server.post('/api/payments/settlements/:id/disburse', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const parseResult = disburseSettlementSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { utrReference } = parseResult.data;

      const updateRes = await pgPool.query(
        `UPDATE pay_svc.caterer_settlements
         SET status = 'settled', utr_reference = $1, settled_at = NOW(), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [utrReference, id]
      );

      if (updateRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Settlement not found' });
      }

      return reply.send({ settlement: updateRes.rows[0] });
    } catch (err: any) {
      console.error('POST /settlements/:id/disburse error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Admin: List all caterer settlements across the platform
  server.get('/api/admin/settlements', async (req, reply) => {
    try {
      const { status } = req.query as { status?: string };
      let sql = `
        SELECT 
          s.id, s.booking_id, s.caterer_id, s.gross_amount_paise,
          s.commission_pct, s.commission_amount_paise, s.net_payout_paise,
          s.status, s.utr_reference, s.settled_at, s.created_at, s.updated_at,
          c.business_name as caterer_business_name,
          b.event_date, b.guest_count
        FROM pay_svc.caterer_settlements s
        JOIN caterer_svc.caterers c ON s.caterer_id = c.id
        LEFT JOIN order_svc.bookings b ON s.booking_id = b.id
      `;
      const params: any[] = [];
      if (status && status !== 'all') {
        params.push(status);
        sql += ` WHERE s.status = $1`;
      }
      sql += ` ORDER BY s.created_at DESC`;

      const res = await pgPool.query(sql, params);
      const settlements = res.rows.map((r) => ({
        id: r.id,
        bookingId: r.booking_id,
        catererId: r.caterer_id,
        catererBusinessName: r.caterer_business_name,
        grossAmountPaise: parseInt(r.gross_amount_paise, 10),
        commissionPct: parseFloat(r.commission_pct),
        commissionAmountPaise: parseInt(r.commission_amount_paise, 10),
        netPayoutPaise: parseInt(r.net_payout_paise, 10),
        status: r.status,
        utrReference: r.utr_reference,
        settledAt: r.settled_at,
        eventDate: r.event_date,
        guestCount: r.guest_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return reply.send({ settlements });
    } catch (err: any) {
      console.error('GET /api/admin/settlements error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Admin: Platform financial & booking analytics
  server.get('/api/admin/analytics', async (_req, reply) => {
    try {
      // 1. Booking & GMV metrics
      const bookingAggRes = await pgPool.query(`
        SELECT 
          COUNT(*)::int as total_bookings,
          COUNT(*) FILTER (WHERE status IN ('paid', 'completed'))::int as paid_bookings,
          COALESCE(SUM(total_amount_paise) FILTER (WHERE status IN ('paid', 'completed')), 0)::bigint as total_gmv_paise,
          COALESCE(SUM(commission_amount_paise) FILTER (WHERE status IN ('paid', 'completed')), 0)::bigint as total_commission_paise
        FROM order_svc.bookings
      `);
      const bRow = bookingAggRes.rows[0];

      // 2. Settlement ledger metrics
      const setAggRes = await pgPool.query(`
        SELECT 
          COALESCE(SUM(net_payout_paise) FILTER (WHERE status = 'settled'), 0)::bigint as total_disbursed_paise,
          COALESCE(SUM(net_payout_paise) FILTER (WHERE status IN ('pending', 'processing')), 0)::bigint as pending_payouts_paise,
          COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int as pending_settlement_count,
          COUNT(*) FILTER (WHERE status = 'settled')::int as settled_count
        FROM pay_svc.caterer_settlements
      `);
      const sRow = setAggRes.rows[0];

      // 3. Caterer count
      const catRes = await pgPool.query(`
        SELECT 
          COUNT(*)::int as total_caterers,
          COUNT(*) FILTER (WHERE status = 'approved')::int as approved_caterers,
          COUNT(*) FILTER (WHERE status = 'pending')::int as pending_caterers
        FROM caterer_svc.caterers
      `);
      const cRow = catRes.rows[0];

      return reply.send({
        analytics: {
          totalGMVPaise: Number(bRow.total_gmv_paise),
          totalCommissionPaise: Number(bRow.total_commission_paise),
          totalDisbursedPaise: Number(sRow.total_disbursed_paise),
          pendingPayoutsPaise: Number(sRow.pending_payouts_paise),
          totalBookingsCount: bRow.total_bookings,
          paidBookingsCount: bRow.paid_bookings,
          pendingSettlementCount: sRow.pending_settlement_count,
          settledCount: sRow.settled_count,
          totalCaterersCount: cRow.total_caterers,
          approvedCaterersCount: cRow.approved_caterers,
          pendingCaterersCount: cRow.pending_caterers,
        },
      });
    } catch (err: any) {
      console.error('GET /api/admin/analytics error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Admin alias for settlement disbursement
  server.post('/api/admin/settlements/:id/disburse', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const parseResult = disburseSettlementSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { utrReference } = parseResult.data;

      const updateRes = await pgPool.query(
        `UPDATE pay_svc.caterer_settlements
         SET status = 'settled', utr_reference = $1, settled_at = NOW(), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [utrReference, id]
      );

      if (updateRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Settlement not found' });
      }

      return reply.send({ success: true, settlement: updateRes.rows[0] });
    } catch (err: any) {
      console.error('POST /api/admin/settlements/:id/disburse error:', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildPaymentServer();
  const PORT = parseInt(process.env.PORT || '4004', 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Payment Service listening at ${address}`);
  });
}
