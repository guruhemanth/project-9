import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { pgPool } from './db';
import { sendMessageSchema, UserRole } from '@caterconnect/shared';

export function buildChatServer() {
  const server = Fastify({ logger: false });

  server.register(fastifyCors, { origin: true });
  server.register(fastifyWebsocket);

  // Health check
  server.get('/health', async () => ({ status: 'ok', service: 'chat-service' }));

  // Get or Create thread for a booking
  server.get('/api/chat/threads/booking/:bookingId', async (req, reply) => {
    try {
      const { bookingId } = req.params as { bookingId: string };
      const userId = req.headers['x-user-id'] as string;
      const userRole = (req.headers['x-user-role'] as string) || 'customer';

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
        userRole !== 'admin' &&
        userId !== booking.customer_id &&
        userId !== booking.caterer_owner_id
      ) {
        return reply.status(403).send({ error: 'Forbidden: You are not a participant in this booking' });
      }

      // 3. Find or create thread
      let threadRes = await pgPool.query(
        'SELECT * FROM chat_svc.chat_threads WHERE booking_id = $1 LIMIT 1',
        [bookingId]
      );

      if (threadRes.rows.length === 0) {
        threadRes = await pgPool.query(
          `INSERT INTO chat_svc.chat_threads (booking_id, customer_id, caterer_id)
           VALUES ($1, $2, $3)
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
      return reply.status(500).send({ error: err.message });
    }
  });

  // Get message history for a thread
  server.get('/api/chat/threads/:threadId/messages', async (req, reply) => {
    try {
      const { threadId } = req.params as { threadId: string };

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
      return reply.status(500).send({ error: err.message });
    }
  });

  // Post message to thread
  server.post('/api/chat/threads/:threadId/messages', async (req, reply) => {
    try {
      const { threadId } = req.params as { threadId: string };
      const senderId = (req.headers['x-user-id'] as string) || (req.body as any).senderId;
      const senderRole = ((req.headers['x-user-role'] as string) || (req.body as any).senderRole || 'customer') as UserRole;

      if (!senderId) {
        return reply.status(401).send({ error: 'Missing sender identification' });
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
        [threadId, senderId, senderRole, message]
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
      return reply.status(500).send({ error: err.message });
    }
  });

  // WebSocket connection for real-time live messaging
  server.register(async function (fastify) {
    fastify.get('/api/chat/ws/:threadId', { websocket: true }, (socket, req) => {
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
