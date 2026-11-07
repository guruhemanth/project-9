import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { z } from 'zod';
import { pgPool } from './db';
import {
  notificationDispatchSchema,
  validateEnv,
  createNotificationEnvSchema,
  buildCorsOptions,
  registerCentralizedErrorHandler,
  loggerRedactionConfig,
  getAuthenticatedUser,
} from '@caterconnect/shared';
import { NotificationDispatcher } from './dispatcher';
import { OutboxWorker } from './outbox';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

function renderMessage(template: string, params: Record<string, any>): string {
  switch (template) {
    case 'booking_requested':
      return `[CaterConnect Tirupati] Hello! Your catering request for ${params.eventDate || 'your event'} (${params.guestCount || 0} guests) has been received. We will notify you once the caterer confirms.`;
    case 'booking_accepted':
      return `[CaterConnect Tirupati] Great news! Caterer '${params.catererName || 'The Caterer'}' accepted your booking. Total: ${params.totalAmountINR || 'INR'}. Pay now to lock your deal: ${params.paymentLink || 'https://caterconnect.in/bookings'}`;
    case 'payment_captured':
    case 'booking_paid':
      return `[CaterConnect Tirupati] Payment Confirmed! Your booking is locked for ${params.eventDate || 'your event'}. Amount paid: ${params.amountPaidINR || 'INR'}. Balance due: ${params.balanceDueINR || '₹0'}.`;
    case 'booking_cancelled':
      return `[CaterConnect Tirupati] Booking cancelled for ${params.eventDate || 'your event'}. Refund: ${params.refundINR || '₹0'}.`;
    case 'booking_completed':
      return `[CaterConnect Tirupati] Thank you for choosing us! Please share feedback for your event.`;
    default:
      return `[CaterConnect] Notification: ${JSON.stringify(params)}`;
  }
}

export function buildNotificationServer() {
  const env = validateEnv(createNotificationEnvSchema(), process.env);
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576,
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });

  registerCentralizedErrorHandler(server, 'notification-service');

  const dispatcher = new NotificationDispatcher({
    mode: env.NOTIFY_MODE,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY,
    vapidSubject: env.VAPID_SUBJECT,
  });

  const outboxWorker = new OutboxWorker(dispatcher);

  // In non-test environments, run background outbox worker
  if (process.env.NODE_ENV !== 'test') {
    outboxWorker.start(3000);
  }

  server.addHook('onClose', async () => {
    outboxWorker.stop();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  server.register(fastifyHelmet, { contentSecurityPolicy: false });
  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));

  // Health & Readiness checks
  server.get('/health', async () => ({ status: 'ok', service: 'notification-service' }));
  server.get('/ready', async (_req, reply) => {
    try {
      await pgPool.query('SELECT 1');
      return { status: 'ready', database: 'connected', service: 'notification-service' };
    } catch {
      return reply.status(503).send({ status: 'not_ready', database: 'disconnected', service: 'notification-service' });
    }
  });

  // Direct Outbox Process Trigger (Used by tests or internal manual sync)
  server.post('/api/notify/outbox/process', async (_req, reply) => {
    try {
      const processed = await outboxWorker.processBatch(20);
      return reply.send({ success: true, processed });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Outbox processing failed' });
    }
  });

  // Web Push Subscription Endpoints (Authenticated)
  server.post('/api/notify/push/subscribe', async (req, reply) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required to subscribe to push notifications' });
      }

      const parseResult = subscribeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parseResult.error.flatten().fieldErrors });
      }

      const { endpoint, keys, userAgent } = parseResult.data;

      const res = await pgPool.query(
        `INSERT INTO notify_svc.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE 
         SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
         RETURNING *`,
        [user.userId, endpoint, keys.p256dh, keys.auth, userAgent || null]
      );

      return reply.status(201).send({ success: true, subscription: res.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to save push subscription' });
    }
  });

  server.post('/api/notify/push/unsubscribe', async (req, reply) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required to unsubscribe' });
      }

      const parseResult = unsubscribeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parseResult.error.flatten().fieldErrors });
      }

      await pgPool.query(
        'DELETE FROM notify_svc.push_subscriptions WHERE endpoint = $1 AND user_id = $2',
        [parseResult.data.endpoint, user.userId]
      );

      return reply.send({ success: true, unsubscribed: true });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to remove push subscription' });
    }
  });

  // Dispatch a notification (WhatsApp or SMS)
  server.post('/api/notify/dispatch', async (req, reply) => {
    try {
      const parseResult = notificationDispatchSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { bookingId, recipientPhone, recipientRole, channel, templateType, params } = parseResult.data;
      const content = renderMessage(templateType, params);
      const providerMsgId = `${channel}_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      let deliveryStatus = 'queued';
      if (channel === 'whatsapp') {
        const waRes = await dispatcher.sendWhatsApp(recipientPhone, content);
        deliveryStatus = waRes.success ? 'sent' : 'failed';
      } else if (channel === 'sms') {
        const smsRes = await dispatcher.sendSms(recipientPhone, content);
        deliveryStatus = smsRes.success ? 'sent' : 'failed';
      }

      const insertRes = await pgPool.query(
        `INSERT INTO notify_svc.notification_logs
         (booking_id, recipient_phone, recipient_role, channel, template_type, content, status, provider_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [bookingId, recipientPhone, recipientRole, channel, templateType, content, deliveryStatus, providerMsgId]
      );

      const log = insertRes.rows[0];
      return reply.status(201).send({
        success: true,
        notification: {
          id: log.id,
          bookingId: log.booking_id,
          recipientPhone: log.recipient_phone,
          channel: log.channel,
          templateType: log.template_type,
          content: log.content,
          status: log.status,
          providerMessageId: log.provider_message_id,
          createdAt: log.created_at,
        },
      });
    } catch (err: any) {
      console.error('POST /notify/dispatch error:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get notification delivery history for a booking
  server.get('/api/notify/logs/:bookingId', async (req, reply) => {
    try {
      const { bookingId } = req.params as { bookingId: string };
      const user = getAuthenticatedUser(req);
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      // Check access: must be booking customer, caterer owner, or admin
      if (user.role !== 'admin') {
        const bRes = await pgPool.query(
          `SELECT b.id, b.customer_id, c.owner_id as caterer_owner_id
           FROM order_svc.bookings b
           JOIN caterer_svc.caterers c ON b.caterer_id = c.id
           WHERE b.id = $1 LIMIT 1`,
          [bookingId]
        );
        if (bRes.rows.length === 0) {
          return reply.status(404).send({ error: 'Booking not found' });
        }
        const booking = bRes.rows[0];
        if (user.userId !== booking.customer_id && user.userId !== booking.caterer_owner_id) {
          return reply.status(403).send({ error: 'Forbidden: Access denied to notification logs' });
        }
      }

      const res = await pgPool.query(
        'SELECT * FROM notify_svc.notification_logs WHERE booking_id = $1 ORDER BY created_at DESC',
        [bookingId]
      );
      return reply.send({ logs: res.rows });
    } catch (err: any) {
      console.error('GET /notify/logs error:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildNotificationServer();
  const PORT = parseInt(process.env.PORT || '4005', 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Notification Service listening at ${address}`);
  });
}
