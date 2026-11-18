import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuthenticatedUser } from '@caterconnect/shared';
import { pgPool } from './db';
import { NotificationDispatcher } from './dispatcher';

export interface SweepResult {
  success: boolean;
  remindersDispatched: number;
  details: Array<{
    bookingId: string;
    reminderType: string;
    channel: string;
    status: string;
  }>;
}

export async function runRemindersSweep(dispatcher: NotificationDispatcher): Promise<SweepResult> {
  const details: Array<{
    bookingId: string;
    reminderType: string;
    channel: string;
    status: string;
  }> = [];

  let remindersDispatched = 0;

  // 1. T-24h Event Reminder: Paid bookings whose event date is tomorrow
  const event24hQuery = `
    SELECT b.id, b.customer_id, b.caterer_id, b.event_date, b.event_time, b.guest_count,
           u.phone as customer_phone, u.full_name as customer_name,
           c.business_name as caterer_name
    FROM order_svc.bookings b
    JOIN auth_svc.users u ON b.customer_id = u.id
    JOIN caterer_svc.caterers c ON b.caterer_id = c.id
    WHERE b.status = 'paid'
      AND b.event_date = (CURRENT_DATE + INTERVAL '1 day')
  `;
  const event24hRes = await pgPool.query(event24hQuery);

  for (const row of event24hRes.rows) {
    const reminderType = 'event_24h';
    const channel = 'whatsapp';
    const payload = {
      eventDate: row.event_date,
      eventTime: row.event_time,
      catererName: row.caterer_name,
      customerName: row.customer_name,
      guestCount: row.guest_count,
      phone: row.customer_phone,
    };

    const insertRes = await pgPool.query(
      `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id, reminder_type) DO NOTHING
       RETURNING id`,
      [row.id, reminderType, channel, JSON.stringify(payload)]
    );

    if (insertRes.rows.length > 0) {
      remindersDispatched++;
      details.push({
        bookingId: row.id,
        reminderType,
        channel,
        status: 'sent',
      });

      // Enqueue to outbox
      await pgPool.query(
        `INSERT INTO notify_svc.notification_outbox (event_type, payload, status)
         VALUES ($1, $2, 'pending')`,
        [
          'booking_reminder',
          JSON.stringify({
            bookingId: row.id,
            customerId: row.customer_id,
            recipientPhone: row.customer_phone,
            templateType: 'event_reminder_24h',
            params: payload,
          }),
        ]
      );

      // Invoke dispatcher
      if (row.customer_phone) {
        await dispatcher.sendWhatsApp(
          row.customer_phone,
          `[CaterConnect] Friendly reminder: Your catering event with ${row.caterer_name} is tomorrow at ${row.event_time || 'scheduled time'}. Enjoy your gathering!`
        ).catch(() => {});
      }
    }
  }

  // 2. T-2h Payment Deadline Reminder: Accepted bookings whose payment deadline is within next 2 hours
  const deadlineQuery = `
    SELECT b.id, b.customer_id, b.caterer_id, b.payment_deadline, b.total_amount_paise,
           u.phone as customer_phone, u.full_name as customer_name,
           c.business_name as caterer_name
    FROM order_svc.bookings b
    JOIN auth_svc.users u ON b.customer_id = u.id
    JOIN caterer_svc.caterers c ON b.caterer_id = c.id
    WHERE b.status = 'accepted'
      AND b.payment_deadline IS NOT NULL
      AND b.payment_deadline > NOW()
      AND b.payment_deadline <= (NOW() + INTERVAL '2 hours')
  `;
  const deadlineRes = await pgPool.query(deadlineQuery);

  for (const row of deadlineRes.rows) {
    const reminderType = 'payment_deadline_2h';
    const channel = 'sms';
    const payload = {
      paymentDeadline: row.payment_deadline,
      totalAmountINR: (row.total_amount_paise / 100).toFixed(2),
      catererName: row.caterer_name,
      customerName: row.customer_name,
      phone: row.customer_phone,
    };

    const insertRes = await pgPool.query(
      `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id, reminder_type) DO NOTHING
       RETURNING id`,
      [row.id, reminderType, channel, JSON.stringify(payload)]
    );

    if (insertRes.rows.length > 0) {
      remindersDispatched++;
      details.push({
        bookingId: row.id,
        reminderType,
        channel,
        status: 'sent',
      });

      await pgPool.query(
        `INSERT INTO notify_svc.notification_outbox (event_type, payload, status)
         VALUES ($1, $2, 'pending')`,
        [
          'payment_deadline_reminder',
          JSON.stringify({
            bookingId: row.id,
            customerId: row.customer_id,
            recipientPhone: row.customer_phone,
            templateType: 'payment_deadline_2h',
            params: payload,
          }),
        ]
      );

      if (row.customer_phone) {
        await dispatcher.sendSms(
          row.customer_phone,
          `[CaterConnect] Urgent: The 12-hour payment window for your booking with ${row.caterer_name} expires soon. Pay now to prevent expiration: https://caterconnect.in/bookings`
        ).catch(() => {});
      }
    }
  }

  // 3. Balance Payment Due Reminder: Paid bookings with remaining balance due
  const balanceQuery = `
    SELECT b.id, b.customer_id, b.caterer_id, b.balance_due_paise, b.balance_due_date, b.event_date,
           u.phone as customer_phone, u.full_name as customer_name,
           c.business_name as caterer_name
    FROM order_svc.bookings b
    JOIN auth_svc.users u ON b.customer_id = u.id
    JOIN caterer_svc.caterers c ON b.caterer_id = c.id
    WHERE b.status = 'paid'
      AND b.balance_due_paise > 0
      AND (
        (b.balance_due_date IS NOT NULL AND b.balance_due_date <= (NOW() + INTERVAL '24 hours'))
        OR b.event_date <= (CURRENT_DATE + INTERVAL '2 days')
      )
  `;
  const balanceRes = await pgPool.query(balanceQuery);

  for (const row of balanceRes.rows) {
    const reminderType = 'balance_due_24h';
    const channel = 'whatsapp';
    const payload = {
      balanceDueINR: (row.balance_due_paise / 100).toFixed(2),
      eventDate: row.event_date,
      catererName: row.caterer_name,
      customerName: row.customer_name,
      phone: row.customer_phone,
    };

    const insertRes = await pgPool.query(
      `INSERT INTO notify_svc.reminders_sent (booking_id, reminder_type, channel, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id, reminder_type) DO NOTHING
       RETURNING id`,
      [row.id, reminderType, channel, JSON.stringify(payload)]
    );

    if (insertRes.rows.length > 0) {
      remindersDispatched++;
      details.push({
        bookingId: row.id,
        reminderType,
        channel,
        status: 'sent',
      });

      await pgPool.query(
        `INSERT INTO notify_svc.notification_outbox (event_type, payload, status)
         VALUES ($1, $2, 'pending')`,
        [
          'balance_due_reminder',
          JSON.stringify({
            bookingId: row.id,
            customerId: row.customer_id,
            recipientPhone: row.customer_phone,
            templateType: 'balance_due_reminder',
            params: payload,
          }),
        ]
      );

      if (row.customer_phone) {
        await dispatcher.sendWhatsApp(
          row.customer_phone,
          `[CaterConnect] Reminder: Your final balance of ₹${payload.balanceDueINR} for the event with ${row.caterer_name} is due. Pay online at https://caterconnect.in/bookings`
        ).catch(() => {});
      }
    }
  }

  return {
    success: true,
    remindersDispatched,
    details,
  };
}

export function registerRemindersRoutes(server: FastifyInstance, dispatcher: NotificationDispatcher) {
  server.post('/api/notify/reminders/sweep', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user || user.role !== 'admin') {
        return reply.status(user ? 403 : 401).send({ error: 'Admin access required' });
      }

      const result = await runRemindersSweep(dispatcher);
      return reply.send(result);
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: err.message || 'Failed to execute reminders sweep' });
    }
  });
}
