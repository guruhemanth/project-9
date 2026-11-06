import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyWebsocket from '@fastify/websocket';
import { pgPool } from './db';
import {
  sendMessageSchema,
  UserRole,
  validateEnv,
  createDbEnvSchema,
  buildCorsOptions,
  registerCentralizedErrorHandler,
  loggerRedactionConfig,
  getAuthenticatedUser,
} from '@caterconnect/shared';

export function buildChatServer() {
  const env = validateEnv(createDbEnvSchema(), process.env);
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576,
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });

  registerCentralizedErrorHandler(server, 'chat-service');

  server.addHook('onClose', async () => {
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  server.register(fastifyHelmet, { contentSecurityPolicy: false });
  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));
  server.register(fastifyWebsocket);

  // Helper to assert caller is a participant in the chat thread or admin
  async function assertThreadParticipant(
    threadId: string,
    actorId: string,
    actorRole: string
  ): Promise<{ authorized: boolean; thread?: any; statusCode?: number; error?: string }> {
    const tRes = await pgPool.query(
      `SELECT t.id, t.customer_id, t.caterer_id, c.owner_id as caterer_owner_id
       FROM chat_svc.chat_threads t
       JOIN caterer_svc.caterers c ON t.caterer_id = c.id
       WHERE t.id = $1 LIMIT 1`,
      [threadId]
    );

    if (tRes.rows.length === 0) {
      return { authorized: false, statusCode: 404, error: 'Chat thread not found' };
    }

    const thread = tRes.rows[0];
    if (
      actorRole !== 'admin' &&
      actorId !== thread.customer_id &&
      actorId !== thread.caterer_owner_id
    ) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: You are not an authorized participant in this chat thread',
      };
    }

    return { authorized: true, thread };
  }

  // Health & Readiness checks
  server.get('/health', async () => ({ status: 'ok', service: 'chat-service' }));
  server.get('/ready', async (_req, reply) => {
    try {
      await pgPool.query('SELECT 1');
      return { status: 'ready', database: 'connected', service: 'chat-service' };
    } catch {
      return reply.status(503).send({ status: 'not_ready', database: 'disconnected', service: 'chat-service' });
    }
  });

  // Get or Create thread for a booking
  server.get('/api/chat/threads/booking/:bookingId', async (req, reply) => {
    try {
      const { bookingId } = req.params as { bookingId: string };
      const user = getAuthenticatedUser(req);
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      // 1. Fetch booking participants
      const bRes = await pgPool.query(
        `SELECT b.id, b.customer_id, b.caterer_id, c.owner_id as caterer_owner_id, c.business_name
         FROM order_svc.bookings b
         JOIN caterer_svc.caterers c ON b.caterer_id = c.id
         WHERE b.id = $1 LIMIT 1`,
        [bookingId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const booking = bRes.rows[0];

      // 2. Authorization check: user must be customer, caterer owner, or admin
      if (
        user.role !== 'admin' &&
        user.userId !== booking.customer_id &&
        user.userId !== booking.caterer_owner_id
      ) {
        return reply.status(403).send({ error: 'Forbidden: You are not a participant in this booking' });
      }

      // 3. Find or create thread (upsert-safe with ON CONFLICT)
      let threadRes = await pgPool.query(
        'SELECT * FROM chat_svc.chat_threads WHERE booking_id = $1 LIMIT 1',
        [bookingId]
      );

      if (threadRes.rows.length === 0) {
        threadRes = await pgPool.query(
          `INSERT INTO chat_svc.chat_threads (booking_id, customer_id, caterer_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (booking_id) DO UPDATE SET updated_at = NOW()
           RETURNING *`,
          [bookingId, booking.customer_id, booking.caterer_id]
        );
      }

      const thread = threadRes.rows[0];
      return reply.send({
        thread: {
          id: thread.id,
          bookingId: thread.booking_id,
          customerId: thread.customer_id,
          catererId: thread.caterer_id,
          catererBusinessName: booking.business_name,
          lastMessageAt: thread.last_message_at,
          createdAt: thread.created_at,
        },
      });
    } catch (err: any) {
      console.error('GET /threads/booking error:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get message history for a thread
  server.get('/api/chat/threads/:threadId/messages', async (req, reply) => {
    try {
      const { threadId } = req.params as { threadId: string };
      const user = getAuthenticatedUser(req);
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const check = await assertThreadParticipant(threadId, user.userId, user.role);
      if (!check.authorized) {
        return reply.status(check.statusCode || 403).send({ error: check.error });
      }

      const mRes = await pgPool.query(
        `SELECT m.id, m.thread_id, m.sender_id, m.sender_role, m.message, m.is_read, m.created_at, u.full_name as sender_name
         FROM chat_svc.chat_messages m
         LEFT JOIN auth_svc.users u ON m.sender_id = u.id
         WHERE m.thread_id = $1
         ORDER BY m.created_at ASC`,
        [threadId]
      );

      return reply.send({
        messages: mRes.rows.map((row) => ({
          id: row.id,
          threadId: row.thread_id,
          senderId: row.sender_id,
          senderName: row.sender_name,
          senderRole: row.sender_role as UserRole,
          message: row.message,
          isRead: row.is_read,
          createdAt: row.created_at,
        })),
      });
    } catch (err: any) {
      console.error('GET /messages error:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Post message to thread
  server.post('/api/chat/threads/:threadId/messages', async (req, reply) => {
    try {
      const { threadId } = req.params as { threadId: string };
      const user = getAuthenticatedUser(req);
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const check = await assertThreadParticipant(threadId, user.userId, user.role);
      if (!check.authorized) {
        return reply.status(check.statusCode || 403).send({ error: check.error });
      }

      const parseResult = sendMessageSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { message } = parseResult.data;

      const mRes = await pgPool.query(
        `INSERT INTO chat_svc.chat_messages (thread_id, sender_id, sender_role, message)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [threadId, user.userId, user.role, message]
      );

      // Update thread timestamp
      await pgPool.query(
        'UPDATE chat_svc.chat_threads SET last_message_at = NOW() WHERE id = $1',
        [threadId]
      );

      const msg = mRes.rows[0];
      return reply.status(201).send({
        message: {
          id: msg.id,
          threadId: msg.thread_id,
          senderId: msg.sender_id,
          senderRole: msg.sender_role,
          message: msg.message,
          isRead: msg.is_read,
          createdAt: msg.created_at,
        },
      });
    } catch (err: any) {
      console.error('POST /messages error:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // WebSocket connection for real-time live messaging
  server.register(async function (fastify) {
    fastify.get('/api/chat/ws/:threadId', { websocket: true }, async (socket, req) => {
      const user = getAuthenticatedUser(req);
      if (!user) {
        socket.send(JSON.stringify({ event: 'error', message: 'Unauthorized: Authentication required' }));
        socket.close(1008, 'Unauthorized');
        return;
      }

      const { threadId } = req.params as { threadId: string };
      const check = await assertThreadParticipant(threadId, user.userId, user.role);
      if (!check.authorized) {
        socket.send(JSON.stringify({ event: 'error', message: check.error || 'Forbidden: Access denied' }));
        socket.close(1008, 'Forbidden');
        return;
      }

      socket.on('message', async (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          socket.send(JSON.stringify({ event: 'ack', receivedAt: new Date().toISOString(), payload: parsed }));
        } catch {
          socket.send(JSON.stringify({ event: 'error', message: 'Invalid JSON' }));
        }
      });
    });
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildChatServer();
  const PORT = parseInt(process.env.PORT || '4006', 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Chat & Messaging Service listening at ${address}`);
  });
}
