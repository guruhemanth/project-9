import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { z } from 'zod';
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
  getAuthenticatedUser,
  verifyInternalToken,
} from '@caterconnect/shared';
import { enqueueOutboxNotification } from './outbox';
import { sendPaymentAlertWebhook } from './alerts';
import { generateInvoiceAndTaxRecords } from './invoicing';
import { registerPayoutRoutes } from './payout';
import { registerReconciliationRoutes } from './reconciliation';

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

  // Register raw body parser to preserve exact byte-for-byte payload for HMAC verification
  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    try {
      const raw = body.toString('utf8');
      (req as any).rawBody = raw;
      const parsed = JSON.parse(raw);
      done(null, parsed);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  const razorpayKeyId = env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = env.RAZORPAY_KEY_SECRET;
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
  const jwtSecret = process.env.JWT_SECRET || 'dev_secret_jwt_caterconnect_secure';

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

  // Create Razorpay Order - OWNERSHIP GUARD (Must be the booking customer)
  server.post('/api/payments/create-order', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const parseResult = createOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { bookingId, paymentOption, advancePct, trancheAmountPaise } = parseResult.data;

      // Query booking details, mode, deadline, ownership, and amounts
      const bRes = await pgPool.query(
        'SELECT id, customer_id, caterer_id, status, total_amount_paise, amount_paid_paise, balance_due_paise, booking_mode, payment_deadline FROM order_svc.bookings WHERE id = $1',
        [bookingId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];

      // Ensure caller is the customer who placed this booking
      if (authUser.role !== 'admin' && booking.customer_id !== authUser.userId) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this booking' });
      }

      const totalPaise = booking.total_amount_paise || 0;
      const amountPaidPaise = booking.amount_paid_paise || 0;
      const balanceDuePaise = (booking.balance_due_paise != null && booking.balance_due_paise > 0)
        ? booking.balance_due_paise
        : Math.max(0, totalPaise - amountPaidPaise);

      let orderAmountPaise = 0;
      let pct = 100;

      // 1. Universal booking lifecycle validation across ALL payment options (advance, full, split)
      const bookingMode = booking.booking_mode || 'on_request';
      if (bookingMode === 'on_request') {
        if (booking.status === 'requested') {
          return reply.status(400).send({
            error: 'This booking is pending caterer review. You can pay once the caterer accepts your request.',
          });
        }
        if (booking.status !== 'accepted' && booking.status !== 'paid') {
          return reply.status(400).send({
            error: `Cannot initiate payment for booking in '${booking.status}' status. Must be 'accepted'.`,
          });
        }
        if (booking.status === 'accepted' && booking.payment_deadline && new Date() > new Date(booking.payment_deadline)) {
          return reply.status(400).send({
            error: 'The 12-hour payment window for this booking has expired. Please submit a new booking request.',
          });
        }
      } else {
        // Instant Booking mode
        if (booking.status !== 'accepted' && booking.status !== 'requested' && booking.status !== 'paid') {
          return reply.status(400).send({
            error: `Cannot initiate payment for booking in '${booking.status}' status.`,
          });
        }
      }

      // 2. Option-specific amount & percentage calculation
      if (paymentOption === 'split') {
        if (!trancheAmountPaise || trancheAmountPaise < 500000) {
          return reply.status(400).send({
            error: 'Minimum split tranche amount is ₹5,000 (500,000 paise)',
          });
        }
        if (trancheAmountPaise > balanceDuePaise) {
          return reply.status(400).send({
            error: 'Tranche amount cannot exceed remaining balance due',
          });
        }
        orderAmountPaise = trancheAmountPaise;
        pct = Math.round((trancheAmountPaise / (totalPaise || 1)) * 100);
      } else if (paymentOption === 'advance') {
        pct = advancePct || 25;
        orderAmountPaise = Math.round((totalPaise * pct) / 100);
      } else {
        // Full payment
        orderAmountPaise = balanceDuePaise > 0 ? balanceDuePaise : totalPaise;
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
        if (razorpayInstance && !razorpayKeyId.startsWith('test_rzp') && !process.env.VITEST && env.NODE_ENV !== 'test') {
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
      const bookingAdvancePct = paymentOption === 'advance' ? Math.min(99.99, pct) : null;
      await pgPool.query(
        `UPDATE order_svc.bookings
         SET payment_type = $1, advance_pct = $2
         WHERE id = $3`,
        [paymentOption, bookingAdvancePct, bookingId]
      );

      // Broadcast real-time NOTIFY event 'payment_in_progress'
      try {
        const realtimeEnvelope = {
          event: 'payment_in_progress',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId,
            catererId: booking.caterer_id,
            customerId: booking.customer_id,
            status: 'payment_in_progress',
            amountPaise: orderAmountPaise,
          },
        };
        await pgPool.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        req.log.warn({ notifyErr }, 'Failed to emit pg_notify for payment_in_progress');
      }

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
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to initiate payment order' });
    }
  });

  const createBalanceOrderSchema = z.object({
    bookingId: z.string().uuid(),
  });

  // Create Razorpay Order for Remaining Balance Payment (P0-8)
  server.post('/api/payments/create-balance-order', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const parseResult = createBalanceOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { bookingId } = parseResult.data;

      // Query booking details, balance, and customer ownership
      const bRes = await pgPool.query(
        'SELECT id, customer_id, status, total_amount_paise, amount_paid_paise, balance_due_paise, balance_due_date, event_date FROM order_svc.bookings WHERE id = $1',
        [bookingId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];

      if (authUser.role !== 'admin' && booking.customer_id !== authUser.userId) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this booking' });
      }

      if (booking.status !== 'paid') {
        return reply.status(400).send({
          error: `Cannot initiate balance payment for booking in '${booking.status}' status. Initial deposit must be paid first.`,
        });
      }

      const balanceDuePaise = booking.balance_due_paise || 0;
      if (balanceDuePaise <= 0) {
        return reply.status(400).send({
          error: 'No balance payment due for this booking. Full amount has already been satisfied.',
        });
      }

      // Generate order ID via Razorpay
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
            amount: balanceDuePaise,
            currency: 'INR',
            receipt: `bal_${bookingId.substring(0, 36)}`,
            notes: {
              bookingId,
              paymentType: 'balance',
            },
          });
          rzpOrderId = rzpOrder.id;
        } catch (gatewayErr: any) {
          req.log.error({ gatewayErr }, 'Razorpay balance order creation failed');
          return reply.status(502).send({
            statusCode: 502,
            error: 'Bad Gateway',
            message: 'Failed to create payment order with payment gateway.',
          });
        }
      } else {
        if (razorpayInstance && !razorpayKeyId.startsWith('test_rzp') && !process.env.VITEST && env.NODE_ENV !== 'test') {
          try {
            const rzpOrder = await razorpayInstance.orders.create({
              amount: balanceDuePaise,
              currency: 'INR',
              receipt: `bal_${bookingId.substring(0, 36)}`,
              notes: {
                bookingId,
                paymentType: 'balance',
              },
            });
            rzpOrderId = rzpOrder.id;
          } catch {
            rzpOrderId = `order_bal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          }
        } else {
          rzpOrderId = `order_bal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        }
      }

      // Record created balance payment in pay_svc.payments
      const payRes = await pgPool.query(
        `INSERT INTO pay_svc.payments 
         (booking_id, razorpay_order_id, amount_paise, currency, status, payment_type)
         VALUES ($1, $2, $3, 'INR', 'created', 'balance')
         RETURNING *`,
        [bookingId, rzpOrderId, balanceDuePaise]
      );

      return reply.status(201).send({
        orderId: rzpOrderId,
        amountPaise: balanceDuePaise,
        currency: 'INR',
        paymentType: 'balance',
        balanceDueDate: booking.balance_due_date,
        keyId: razorpayKeyId,
        payment: payRes.rows[0],
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to initiate balance payment order' });
    }
  });

  // Shared helper to transition booking to paid, track balance, create initial settlement, and enqueue notifications
  async function processSuccessfulPayment(
    client: any,
    orderId: string,
    paymentId: string,
    amountPaise?: number,
    rawPayload?: any
  ): Promise<{ error?: string; statusCode?: number; received?: boolean; idempotent?: boolean; bookingId?: string; success?: boolean }> {
    // 1. Row-level lock on payment record to prevent race conditions
    const pRes = await client.query(
      'SELECT * FROM pay_svc.payments WHERE razorpay_order_id = $1 FOR UPDATE',
      [orderId]
    );

    if (pRes.rows.length === 0) {
      return { error: 'Payment order record not found', statusCode: 404 };
    }

    const payRow = pRes.rows[0];

    // 2. Amount and Currency verification: paid amount & currency must match expected order
    if (typeof amountPaise === 'number' && payRow.amount_paise !== amountPaise) {
      await sendPaymentAlertWebhook({
        alertType: 'PAYMENT_AMOUNT_MISMATCH',
        severity: 'CRITICAL',
        message: `Recorded payment amount differs from Razorpay captured amount: expected ${payRow.amount_paise}, received ${amountPaise}`,
        details: {
          bookingId: payRow.booking_id,
          expectedPaise: payRow.amount_paise,
          receivedPaise: amountPaise,
          error: 'Recorded payment amount differs from Razorpay captured amount',
        },
      });
      return {
        error: `Payment amount mismatch: expected ${payRow.amount_paise}, received ${amountPaise}`,
        statusCode: 400,
      };
    }

    const receivedCurrency = rawPayload?.payload?.payment?.entity?.currency;
    if (receivedCurrency && receivedCurrency !== 'INR') {
      return {
        error: `Payment currency mismatch: expected INR, received ${receivedCurrency}`,
        statusCode: 400,
      };
    }

    // 3. Idempotency: If this payment was already captured, acknowledge immediately without duplicate processing
    if (payRow.status === 'captured') {
      return { received: true, idempotent: true, bookingId: payRow.booking_id };
    }

    const bookingId = payRow.booking_id;
    const finalAmountPaise = amountPaise || payRow.amount_paise;

    // Update payment record to captured
    await client.query(
      `UPDATE pay_svc.payments 
       SET status = 'captured', razorpay_payment_id = $1, raw_payload = $2, updated_at = NOW()
       WHERE id = $3`,
      [paymentId || `pay_${Date.now()}`, rawPayload || {}, payRow.id]
    );

    // Fetch booking with row lock
    const bRes = await client.query(
      'SELECT id, customer_id, caterer_id, status, total_amount_paise, amount_paid_paise, balance_due_paise, payment_type, event_date FROM order_svc.bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    );

    if (bRes.rows.length === 0) {
      return { error: 'Booking not found', statusCode: 404 };
    }

    const booking = bRes.rows[0];

    // CRITICAL: A replayed/duplicate event must NEVER move a completed or cancelled booking back to 'paid'
    if (booking.status !== 'completed' && booking.status !== 'cancelled') {
      const totalAmount = booking.total_amount_paise || 0;

      // Handle Balance / Split Payment vs Initial Advance/Full Payment
      if (payRow.payment_type === 'balance' || payRow.payment_type === 'split') {
        const updatedAmountPaid = (booking.amount_paid_paise || 0) + finalAmountPaise;
        const updatedBalanceDue = Math.max(0, totalAmount - updatedAmountPaid);

        await client.query(
          `UPDATE order_svc.bookings 
           SET status = 'paid',
               amount_paid_paise = $1, 
               balance_due_paise = $2, 
               advance_paid_at = COALESCE(advance_paid_at, NOW()),
               balance_due_date = (CASE WHEN $3 > 0 THEN event_date - INTERVAL '2 days' ELSE NULL END),
               updated_at = NOW()
           WHERE id = $4`,
          [updatedAmountPaid, updatedBalanceDue, updatedBalanceDue, bookingId]
        );

        await client.query(
          `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, note)
           VALUES ($1, $2, 'paid', $3)`,
          [bookingId, booking.status, `${payRow.payment_type === 'split' ? 'Split' : 'Balance'} payment captured via Razorpay ID: ${paymentId}`]
        );

        // Update settlement gross and net payout to full total order amounts
        const cRes = await client.query(
          `SELECT COALESCE(commission_pct, 15.00) as commission_pct FROM caterer_svc.caterers WHERE id = $1`,
          [booking.caterer_id]
        );
        const commissionPct = parseFloat(cRes.rows[0]?.commission_pct || '15.00');
        const commissionPaise = Math.round((totalAmount * commissionPct) / 100);
        const netPayoutPaise = Math.max(0, updatedAmountPaid - commissionPaise);

        await client.query(
          `INSERT INTO pay_svc.caterer_settlements
           (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (booking_id) DO UPDATE 
           SET gross_amount_paise = EXCLUDED.gross_amount_paise,
               commission_pct = EXCLUDED.commission_pct,
               commission_amount_paise = EXCLUDED.commission_amount_paise,
               net_payout_paise = EXCLUDED.net_payout_paise,
               updated_at = NOW()`,
          [booking.id, booking.caterer_id, updatedAmountPaid, commissionPct, commissionPaise, netPayoutPaise]
        );
      } else {
        // Initial Advance or Full Payment
        const balanceDue = Math.max(0, totalAmount - finalAmountPaise);
        const isAdvance = payRow.payment_type === 'advance' || booking.payment_type === 'advance';

        await client.query(
          `UPDATE order_svc.bookings 
           SET status = 'paid', 
               amount_paid_paise = $1, 
               balance_due_paise = $2, 
               advance_paid_at = NOW(),
               balance_due_date = (CASE WHEN $4 = true THEN event_date - INTERVAL '2 days' ELSE NULL END),
               updated_at = NOW()
           WHERE id = $3`,
          [finalAmountPaise, balanceDue, bookingId, isAdvance]
        );

        // Record in booking audit history
        await client.query(
          `INSERT INTO order_svc.booking_status_history (booking_id, from_status, to_status, note)
           VALUES ($1, $2, 'paid', $3)`,
          [bookingId, booking.status, `Payment captured via Razorpay ID: ${paymentId}`]
        );

        // Dynamic Caterer Commission & Settlement Calculation
        const cRes = await client.query(
          `SELECT COALESCE(commission_pct, 15.00) as commission_pct FROM caterer_svc.caterers WHERE id = $1`,
          [booking.caterer_id]
        );
        const commissionPct = parseFloat(cRes.rows[0]?.commission_pct || '15.00');
        const commissionPaise = Math.round((totalAmount * commissionPct) / 100);

        let netPayoutPaise = 0;
        const grossCollectedPaise = finalAmountPaise;

        if (isAdvance) {
          // Upfront 25% advance:
          // Platform retains full 15% commission of total order from advance.
          // Caterer receives remaining upfront cash (paidAmount - commissionPaise) = 10% of total order.
          netPayoutPaise = Math.max(0, finalAmountPaise - commissionPaise);
        } else {
          // Full 100% payment:
          // Platform keeps 15%, caterer receives 85% of total order upon completion.
          netPayoutPaise = Math.max(0, totalAmount - commissionPaise);
        }

        await client.query(
          `INSERT INTO pay_svc.caterer_settlements
           (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (booking_id) DO UPDATE 
           SET gross_amount_paise = EXCLUDED.gross_amount_paise,
               commission_pct = EXCLUDED.commission_pct,
               commission_amount_paise = EXCLUDED.commission_amount_paise,
               net_payout_paise = EXCLUDED.net_payout_paise,
               updated_at = NOW()`,
          [booking.id, booking.caterer_id, grossCollectedPaise, commissionPct, commissionPaise, netPayoutPaise]
        );
      }

      // Enqueue Outbox notification: booking_paid / payment_captured -> both parties
      const bDetails = await client.query(
        `SELECT b.customer_id, b.event_date, c.owner_id as caterer_owner_id, c.business_name
         FROM order_svc.bookings b
         JOIN caterer_svc.caterers c ON b.caterer_id = c.id
         WHERE b.id = $1`,
        [bookingId]
      );
      if (bDetails.rows.length > 0) {
        const bd = bDetails.rows[0];
        await enqueueOutboxNotification(
          'booking_paid',
          {
            bookingId,
            customerId: bd.customer_id,
            catererOwnerId: bd.caterer_owner_id,
            catererName: bd.business_name,
            eventDate: bd.event_date,
            amountPaidINR: `₹${(finalAmountPaise / 100).toLocaleString('en-IN')}`,
            paymentType: payRow.payment_type || 'full',
          },
          client
        );
      }

      // Generate statutory GST commission invoice and tax ledger records
      try {
        await generateInvoiceAndTaxRecords(client, bookingId);
      } catch (invErr) {
        console.warn('Failed to generate invoice in processSuccessfulPayment:', invErr);
      }

      // Broadcast real-time NOTIFY 'booking_paid'
      try {
        const realtimeEnvelope = {
          event: 'booking_paid',
          timestamp: new Date().toISOString(),
          payload: {
            bookingId,
            catererId: booking.caterer_id,
            customerId: booking.customer_id,
            status: 'paid',
            amountPaise: finalAmountPaise,
          },
        };
        await client.query(`SELECT pg_notify('caterconnect_events', $1)`, [JSON.stringify(realtimeEnvelope)]);
      } catch (notifyErr) {
        console.warn('Failed to emit pg_notify for booking_paid:', notifyErr);
      }
    }

    return { received: true, success: true, bookingId };
  }

  // Verify Razorpay Payment Signature (Direct from Client Checkout modal)
  server.post('/api/payments/verify-signature', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = (req.body as any) || {};

      if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return reply.status(400).send({
          error: 'Missing required fields: bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature',
        });
      }

      // Verify HMAC-SHA256 signature
      const expectedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      const sigBuf = Buffer.from(razorpaySignature, 'utf8');
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return reply.status(400).send({ error: 'Invalid Razorpay payment signature' });
      }

      // Verify booking ownership
      const bRes = await pgPool.query(
        'SELECT id, customer_id, total_amount_paise, status FROM order_svc.bookings WHERE id = $1',
        [bookingId]
      );
      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }
      if (authUser.role !== 'admin' && bRes.rows[0].customer_id !== authUser.userId) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this booking' });
      }

      // Record client signature verification on payment record without transitioning booking status to paid (P0-6)
      await pgPool.query(
        `UPDATE pay_svc.payments
         SET razorpay_payment_id = COALESCE(razorpay_payment_id, $1),
             raw_payload = jsonb_set(COALESCE(raw_payload, '{}'::jsonb), '{signature_verified}', 'true'::jsonb),
             updated_at = NOW()
         WHERE razorpay_order_id = $2`,
        [razorpayPaymentId, razorpayOrderId]
      );

      return reply.send({
        success: true,
        verified: true,
        message: 'Payment signature verified. Awaiting webhook confirmation to finalize booking.',
        booking: bRes.rows[0],
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: err?.message || 'Failed to verify payment signature' });
    }
  });

  // Razorpay Webhook Handler
  // Verifies HMAC SHA-256 signature over raw request body using timing-safe comparison,
  // validates exact amount, and idempotently locks rows to prevent replay and race conditions
  server.post('/api/payments/webhook', async (req, reply) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      if (!signature) {
        return reply.status(400).send({ error: 'Missing x-razorpay-signature header' });
      }

      // Exact raw request body as received over the wire
      const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

      // Verify HMAC-SHA256 signature with timingSafeEqual to prevent timing attacks
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signature, 'utf8');
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        await sendPaymentAlertWebhook({
          alertType: 'WEBHOOK_SIGNATURE_INVALID',
          severity: 'HIGH',
          message: 'Received invalid Razorpay webhook signature',
          details: { signatureLength: sigBuf.length },
        }, req.log);
        return reply.status(400).send({ error: 'Invalid Razorpay webhook signature' });
      }

      const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const paymentEntity = event.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      const amountPaise = paymentEntity?.amount;
      const eventId = event.id || (paymentId ? `evt_${paymentId}_${event.event}` : `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`);
      const eventType = event.event || 'unknown';
      const entityId = paymentId || orderId || null;

      // 1. Check idempotency in dedicated webhook_events table (P0-4, P1-5)
      const existingEv = await pgPool.query(
        'SELECT status FROM pay_svc.webhook_events WHERE event_id = $1',
        [eventId]
      );
      if (existingEv.rows.length > 0 && existingEv.rows[0].status === 'processed') {
        return reply.send({ received: true, idempotent: true, eventId });
      }

      // Record in webhook_events as processing or increment attempt count
      await pgPool.query(
        `INSERT INTO pay_svc.webhook_events (event_id, event_type, entity_id, payload, status)
         VALUES ($1, $2, $3, $4, 'processing')
         ON CONFLICT (event_id) DO UPDATE 
         SET attempts = pay_svc.webhook_events.attempts + 1`,
        [eventId, eventType, entityId, JSON.stringify(event)]
      );

      if (event.event === 'order.paid' || event.event === 'payment.captured') {
        if (orderId) {
          const client = await pgPool.connect();
          try {
            await client.query('BEGIN');

            const result = await processSuccessfulPayment(client, orderId, paymentId, amountPaise, event);

            if (result.error) {
              req.log.warn({ result }, 'Webhook payment processing failed');
              await client.query('ROLLBACK');
              await pgPool.query(
                `UPDATE pay_svc.webhook_events SET status = 'failed', error_message = $1 WHERE event_id = $2`,
                [result.error, eventId]
              );
              return reply.status(result.statusCode || 400).send({ error: result.error });
            }

            await client.query('COMMIT');

            await pgPool.query(
              `UPDATE pay_svc.webhook_events SET status = 'processed', processed_at = NOW() WHERE event_id = $1`,
              [eventId]
            );

            return reply.send({ received: true, idempotent: result.idempotent || false, eventId });
          } catch (txErr: any) {
            await client.query('ROLLBACK');
            await pgPool.query(
              `UPDATE pay_svc.webhook_events SET status = 'failed', error_message = $1 WHERE event_id = $2`,
              [txErr?.message || 'Transaction error', eventId]
            );
            throw txErr;
          } finally {
            client.release();
          }
        }
      }

      await pgPool.query(
        `UPDATE pay_svc.webhook_events SET status = 'ignored', processed_at = NOW() WHERE event_id = $1`,
        [eventId]
      );
      return reply.send({ received: true, ignored: true, eventId });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to process payment webhook' });
    }
  });

  // Generate settlement ledger entry for a completed booking - ADMIN GUARD
  server.post('/api/payments/settlements/generate', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { bookingId } = (req.body as any) || {};
      if (!bookingId) {
        return reply.status(400).send({ error: 'bookingId is required' });
      }

      // Query booking details and caterer dynamic commission
      const bRes = await pgPool.query(
        `SELECT b.id, b.caterer_id, b.status, b.total_amount_paise, 
                COALESCE(c.commission_pct, b.commission_pct, 15.00) as commission_pct
         FROM order_svc.bookings b
         LEFT JOIN caterer_svc.caterers c ON b.caterer_id = c.id
         WHERE b.id = $1`,
        [bookingId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];
      const grossPaise = booking.total_amount_paise || 0;
      const commissionPct = parseFloat(booking.commission_pct || '15.00');
      // Exact integer paise with round half up
      const commissionPaise = Math.round((grossPaise * commissionPct) / 100);
      const netPayoutPaise = grossPaise - commissionPaise;

      const sRes = await pgPool.query(
        `INSERT INTO pay_svc.caterer_settlements
         (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (booking_id) DO UPDATE 
         SET gross_amount_paise = EXCLUDED.gross_amount_paise,
             commission_pct = EXCLUDED.commission_pct,
             commission_amount_paise = EXCLUDED.commission_amount_paise,
             net_payout_paise = EXCLUDED.net_payout_paise,
             updated_at = NOW()
         RETURNING *`,
        [booking.id, booking.caterer_id, grossPaise, commissionPct, commissionPaise, netPayoutPaise]
      );

      return reply.status(201).send({ settlement: sRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to generate settlement' });
    }
  });

  // Get caterer's financial settlement ledger & totals - CATERER OWNER OR ADMIN GUARD
  server.get('/api/payments/settlements/caterer/:catererId', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { catererId } = req.params as { catererId: string };

      if (authUser.role !== 'admin') {
        const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [catererId]);
        if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this caterer ledger' });
        }
      }

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
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve settlements' });
    }
  });

  // Admin marks settlement as disbursed with bank UTR reference - ADMIN GUARD (P0-11 Safety Gate)
  const disburseSettlementHandler = async (req: any, reply: any) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { id } = req.params as { id: string };
      const parseResult = disburseSettlementSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { utrReference } = parseResult.data;

      // Production & Safety Guard (P0-11): Verify status, bank details, net payout, and event completion
      const checkRes = await pgPool.query(
        `SELECT 
           s.id, s.status, s.net_payout_paise, s.booking_id,
           c.id as caterer_id, c.business_name, c.bank_account_number, c.bank_ifsc,
           b.status as booking_status,
           TO_CHAR(b.event_date, 'YYYY-MM-DD') as event_date
         FROM pay_svc.caterer_settlements s
         JOIN caterer_svc.caterers c ON s.caterer_id = c.id
         LEFT JOIN order_svc.bookings b ON s.booking_id = b.id
         WHERE s.id = $1`,
        [id]
      );

      if (checkRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Settlement not found' });
      }

      const settlementInfo = checkRes.rows[0];

      // Status checks
      if (settlementInfo.status === 'held') {
        return reply.status(400).send({
          error: 'Cannot disburse payout: Settlement is currently on hold. Release the hold before disbursing.',
          code: 'SETTLEMENT_HELD',
        });
      }

      if (settlementInfo.status === 'settled') {
        return reply.status(400).send({
          error: 'Settlement has already been disbursed.',
          code: 'ALREADY_SETTLED',
        });
      }

      const netPayout = parseInt(settlementInfo.net_payout_paise, 10);
      if (netPayout <= 0) {
        return reply.status(400).send({
          error: 'Cannot disburse settlement with net payout of ₹0. Funds have been refunded or held back.',
          code: 'ZERO_PAYOUT',
        });
      }

      if (!settlementInfo.bank_account_number || !settlementInfo.bank_ifsc) {
        return reply.status(422).send({
          error: `Cannot disburse payout: Caterer '${settlementInfo.business_name}' has not registered bank account details (Account Number & IFSC) yet. Payout held until bank account is registered.`,
          code: 'BANK_DETAILS_MISSING',
        });
      }

      // P0-11: Release Safety Gate — Booking must not be cancelled, and must be completed OR event date past
      if (settlementInfo.booking_status === 'cancelled') {
        return reply.status(400).send({
          error: 'Cannot disburse settlement for a cancelled booking.',
          code: 'BOOKING_CANCELLED',
        });
      }

      const eventDateStr = settlementInfo.event_date;
      const isEventPassed = eventDateStr
        ? new Date(`${eventDateStr}T23:59:59+05:30`).getTime() <= Date.now()
        : false;
      const isCompleted = settlementInfo.booking_status === 'completed';

      if (!isCompleted && !isEventPassed) {
        return reply.status(400).send({
          error: `Cannot disburse settlement before the event has occurred. Event date is ${eventDateStr} and booking status is '${settlementInfo.booking_status}'. Payout can only be released after the event has occurred or is marked completed.`,
          code: 'EVENT_IN_FUTURE',
          eventDate: eventDateStr,
          bookingStatus: settlementInfo.booking_status,
        });
      }

      const updateRes = await pgPool.query(
        `UPDATE pay_svc.caterer_settlements
         SET status = 'settled', utr_reference = $1, settled_at = NOW(), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [utrReference, id]
      );

      if (updateRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Settlement not found' });
      }

      // Record in audit_svc.admin_audit_logs (P0-27)
      await pgPool.query(
        `INSERT INTO audit_svc.admin_audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, 'disburse_settlement', 'settlement', $2, $3, $4)`,
        [
          authUser.userId,
          id,
          JSON.stringify({
            utrReference,
            netPayoutPaise: updateRes.rows[0].net_payout_paise,
            catererId: updateRes.rows[0].caterer_id,
            bookingId: settlementInfo.booking_id,
          }),
          req.ip || null,
        ]
      );

      return reply.send({ settlement: updateRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to disburse settlement' });
    }
  };

  server.post('/api/payments/settlements/:id/disburse', disburseSettlementHandler);
  server.post('/api/admin/settlements/:id/disburse', disburseSettlementHandler);

  // Admin: List all caterer settlements across the platform - ADMIN GUARD
  server.get('/api/admin/settlements', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { status } = req.query as { status?: string };
      let sql = `
        SELECT 
          s.id, s.booking_id, s.caterer_id, s.gross_amount_paise,
          s.commission_pct, s.commission_amount_paise, s.net_payout_paise,
          s.status, s.utr_reference, s.settled_at, s.created_at, s.updated_at,
          c.business_name as caterer_business_name,
          c.bank_account_holder_name,
          c.bank_account_number,
          c.bank_ifsc,
          c.bank_name,
          c.upi_id,
          c.bank_verified,
          TO_CHAR(b.event_date, 'YYYY-MM-DD') as event_date,
          b.guest_count,
          b.status as booking_status
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
        bankAccountHolderName: r.bank_account_holder_name,
        bankAccountNumber: r.bank_account_number,
        bankIfsc: r.bank_ifsc,
        bankName: r.bank_name,
        upiId: r.upi_id,
        bankVerified: Boolean(r.bank_verified),
        grossAmountPaise: parseInt(r.gross_amount_paise, 10),
        commissionPct: parseFloat(r.commission_pct),
        commissionAmountPaise: parseInt(r.commission_amount_paise, 10),
        netPayoutPaise: parseInt(r.net_payout_paise, 10),
        status: r.status,
        utrReference: r.utr_reference,
        settledAt: r.settled_at,
        eventDate: r.event_date,
        guestCount: r.guest_count,
        bookingStatus: r.booking_status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return reply.send({ settlements });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to list admin settlements' });
    }
  });

  // Admin: Platform financial & booking analytics - ADMIN GUARD
  server.get('/api/admin/analytics', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

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
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve admin analytics' });
    }
  });

  // Admin: Hold settlement payout - ADMIN GUARD (P1-4)
  server.post('/api/admin/settlements/:id/hold', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { id } = req.params as { id: string };
      const { reason } = (req.body as { reason?: string }) || {};

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return reply.status(400).send({ error: 'A valid reason for holding the settlement is required' });
      }

      const cur = await pgPool.query(
        'SELECT id, status, caterer_id, net_payout_paise FROM pay_svc.caterer_settlements WHERE id = $1',
        [id]
      );
      if (cur.rows.length === 0) {
        return reply.status(404).send({ error: 'Settlement not found' });
      }

      if (cur.rows[0].status === 'settled') {
        return reply.status(400).send({ error: 'Cannot hold a settlement that has already been settled/disbursed' });
      }

      const updateRes = await pgPool.query(
        `UPDATE pay_svc.caterer_settlements
         SET status = 'held', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
      );

      await pgPool.query(
        `INSERT INTO audit_svc.admin_audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, 'hold_settlement', 'settlement', $2, $3, $4)`,
        [
          authUser.userId,
          id,
          JSON.stringify({
            reason: reason.trim(),
            previousStatus: cur.rows[0].status,
            netPayoutPaise: cur.rows[0].net_payout_paise,
          }),
          req.ip || null,
        ]
      );

      return reply.send({ success: true, settlement: updateRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to hold settlement' });
    }
  });

  // Admin: Release settlement payout hold - ADMIN GUARD (P1-4)
  server.post('/api/admin/settlements/:id/release', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { id } = req.params as { id: string };
      const { notes } = (req.body as { notes?: string }) || {};

      const cur = await pgPool.query(
        'SELECT id, status, caterer_id, net_payout_paise FROM pay_svc.caterer_settlements WHERE id = $1',
        [id]
      );
      if (cur.rows.length === 0) {
        return reply.status(404).send({ error: 'Settlement not found' });
      }

      if (cur.rows[0].status !== 'held') {
        return reply.status(400).send({ error: `Settlement is not held (current status: ${cur.rows[0].status})` });
      }

      const netPayout = parseInt(cur.rows[0].net_payout_paise, 10);
      if (netPayout <= 0) {
        return reply.status(400).send({ error: 'Cannot release settlement with ₹0 net payout' });
      }

      const updateRes = await pgPool.query(
        `UPDATE pay_svc.caterer_settlements
         SET status = 'pending', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
      );

      await pgPool.query(
        `INSERT INTO audit_svc.admin_audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, 'release_settlement', 'settlement', $2, $3, $4)`,
        [
          authUser.userId,
          id,
          JSON.stringify({
            notes: notes ? notes.trim() : 'Released by admin',
            netPayoutPaise: netPayout,
          }),
          req.ip || null,
        ]
      );

      return reply.send({ success: true, settlement: updateRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to release settlement' });
    }
  });

  // Automated internal refund endpoint (called on booking cancellation / caterer rejection)
  server.post('/api/payments/internal/refund', async (req, reply) => {
    try {
      const internalToken = (req.headers['x-internal-token'] as string) || (req.headers['authorization'] as string)?.replace('Bearer ', '');
      const internalPayload = verifyInternalToken(internalToken, jwtSecret);
      const authUser = getAuthenticatedUser(req);

      const isInternalService = internalPayload && (internalPayload.role === 'admin' || internalPayload.userId === 'booking-order-service');
      const isAdminUser = authUser && authUser.role === 'admin';

      if (!isInternalService && !isAdminUser) {
        return reply.status(403).send({ error: 'Forbidden: Internal service or admin access required' });
      }

      const { bookingId, refundAmountPaise, reason } = req.body as {
        bookingId: string;
        refundAmountPaise: number;
        reason?: string;
      };

      if (!bookingId || !refundAmountPaise) {
        return reply.status(400).send({ error: 'bookingId and refundAmountPaise are required' });
      }

      // Find captured payment for this booking (can be captured or partially_refunded)
      const pRes = await pgPool.query(
        "SELECT id, razorpay_payment_id, amount_paise FROM pay_svc.payments WHERE booking_id = $1 AND status IN ('captured', 'partially_refunded') ORDER BY created_at DESC LIMIT 1",
        [bookingId]
      );

      if (pRes.rows.length === 0) {
        return reply.status(404).send({ error: 'No captured payment found for this booking' });
      }

      const payment = pRes.rows[0];
      const razorpayPaymentId = payment.razorpay_payment_id;
      let rzpRefundId = `rfnd_sim_${Date.now()}`;

      // Query booking to compute cumulative refunds
      const bRes = await pgPool.query(
        'SELECT id, amount_paid_paise, refund_amount_paise, status FROM order_svc.bookings WHERE id = $1',
        [bookingId]
      );
      const currentBooking = bRes.rows[0];
      const totalPaid = currentBooking?.amount_paid_paise || payment.amount_paise || 0;
      const prevRefunded = currentBooking?.refund_amount_paise || 0;
      const remainingRefundable = Math.max(0, totalPaid - prevRefunded);

      if (refundAmountPaise > remainingRefundable) {
        return reply.status(400).send({
          error: `Requested refund of ₹${refundAmountPaise / 100} exceeds remaining refundable balance of ₹${remainingRefundable / 100}`,
          remainingRefundablePaise: remainingRefundable,
        });
      }

      const newTotalRefund = prevRefunded + refundAmountPaise;
      const isFullRefund = newTotalRefund >= totalPaid;

      if (razorpayInstance && razorpayPaymentId && !razorpayPaymentId.startsWith('pay_test_') && !process.env.VITEST && env.NODE_ENV !== 'test') {
        try {
          const refundRes = await razorpayInstance.payments.refund(razorpayPaymentId, {
            amount: refundAmountPaise,
            notes: { bookingId, reason: reason || 'Automated cancellation / dispute refund' },
          });
          rzpRefundId = refundRes.id;
        } catch (rfErr: any) {
          req.log.error({ rfErr }, 'Razorpay gateway refund error');
        }
      }

      // Record refund in payments (mark refunded if full, partially_refunded if partial)
      await pgPool.query(
        "UPDATE pay_svc.payments SET status = (CASE WHEN $1 = true THEN 'refunded' ELSE 'partially_refunded' END), updated_at = NOW() WHERE id = $2",
        [isFullRefund, payment.id]
      );

      // Record cumulative refund in booking
      await pgPool.query(
        'UPDATE order_svc.bookings SET refund_id = $1, refunded_at = NOW(), refund_amount_paise = $2, updated_at = NOW() WHERE id = $3',
        [rzpRefundId, newTotalRefund, bookingId]
      );

      // Adjust caterer settlement: claw back refund amount from net payout; if 0 remaining, hold settlement
      await pgPool.query(
        `UPDATE pay_svc.caterer_settlements 
         SET net_payout_paise = GREATEST(0, net_payout_paise - $1),
             status = (CASE WHEN net_payout_paise - $1 <= 0 THEN 'held' ELSE status END),
             updated_at = NOW() 
         WHERE booking_id = $2`,
        [refundAmountPaise, bookingId]
      );

      // Record in audit_svc.admin_audit_logs
      const adminActorId = authUser?.userId || internalPayload?.userId || 'system';
      await pgPool.query(
        `INSERT INTO audit_svc.admin_audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, 'custom_refund', 'booking', $2, $3, $4)`,
        [
          adminActorId,
          bookingId,
          JSON.stringify({
            refundAmountPaise,
            newTotalRefund,
            isFullRefund,
            reason: reason || 'Dispute / custom refund',
            rzpRefundId,
          }),
          req.ip || null,
        ]
      );

      return reply.send({
        success: true,
        refundId: rzpRefundId,
        amountPaise: refundAmountPaise,
        refundAmountPaise,
        newTotalRefundPaise: newTotalRefund,
        isFullRefund,
      });
    } catch (err: any) {
      req.log.error(err, 'Internal refund processing failed');
      return reply.status(500).send({ error: 'Internal refund failed' });
    }
  });

  // Register Automated Payouts & Retry Routes (P1-2)
  registerPayoutRoutes(server);

  // Register Daily Reconciliation Engine & Admin Routes (P1-1)
  registerReconciliationRoutes(server, processSuccessfulPayment, razorpayInstance);

  // GET /api/bookings/:id/invoice (P1-6)
  server.get('/api/bookings/:id/invoice', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const { id } = req.params as { id: string };
      const bRes = await pgPool.query(
        'SELECT id, customer_id, caterer_id, status FROM order_svc.bookings WHERE id = $1',
        [id]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];
      if (booking.status === 'requested' || booking.status === 'accepted') {
        return reply.status(400).send({ error: 'Invoice is only available for confirmed/paid bookings.' });
      }

      // Check access permission: customer, caterer owner, or admin
      if (authUser.role !== 'admin' && booking.customer_id !== authUser.userId) {
        const cRes = await pgPool.query(
          'SELECT id FROM caterer_svc.caterers WHERE id = $1 AND owner_id = $2',
          [booking.caterer_id, authUser.userId]
        );
        if (cRes.rows.length === 0 && authUser.userId !== booking.caterer_id) {
          return reply.status(403).send({ error: 'Forbidden: You do not have permission to view this invoice' });
        }
      }

      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const invoice = await generateInvoiceAndTaxRecords(client, id);
        await client.query('COMMIT');
        if (!invoice) {
          return reply.status(404).send({ error: 'Invoice not found' });
        }

        const lineItems = typeof invoice.line_items === 'string'
          ? JSON.parse(invoice.line_items)
          : invoice.line_items || [];

        return reply.send({
          success: true,
          invoice: {
            id: invoice.id,
            bookingId: invoice.booking_id,
            catererId: invoice.caterer_id,
            customerId: invoice.customer_id,
            invoiceNumber: invoice.invoice_number,
            invoiceType: invoice.invoice_type,
            totalAmountPaise: invoice.total_amount_paise,
            taxableAmountPaise: invoice.taxable_amount_paise,
            totalTaxPaise: (invoice.cgst_paise || 0) + (invoice.sgst_paise || 0) + (invoice.igst_paise || 0),
            cgstPaise: invoice.cgst_paise,
            sgstPaise: invoice.sgst_paise,
            igstPaise: invoice.igst_paise || 0,
            sacCode: invoice.sac_code,
            status: invoice.status,
            lineItems,
            createdAt: invoice.created_at,
            // Aliases for db-row compatibility
            booking_id: invoice.booking_id,
            caterer_id: invoice.caterer_id,
            customer_id: invoice.customer_id,
            invoice_number: invoice.invoice_number,
            invoice_type: invoice.invoice_type,
            total_amount_paise: invoice.total_amount_paise,
            taxable_amount_paise: invoice.taxable_amount_paise,
            cgst_paise: invoice.cgst_paise,
            sgst_paise: invoice.sgst_paise,
            igst_paise: invoice.igst_paise,
            sac_code: invoice.sac_code,
            line_items: lineItems,
            created_at: invoice.created_at,
          },
        });
      } catch (err: any) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve invoice' });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const app = buildPaymentServer();
  const PORT = parseInt(
    process.env.PAYMENT_PORT || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : '4004'),
    10
  );
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Payment Service listening at ${address}`);
  });
}
