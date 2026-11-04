import { pgPool } from './db';
import { NotificationDispatcher } from './dispatcher';

export interface OutboxItem {
  id: string;
  event_type: string;
  payload: any;
  retry_count: number;
}

export class OutboxWorker {
  private dispatcher: NotificationDispatcher;
  private isRunning: boolean = false;
  private intervalHandle: any = null;

  constructor(dispatcher: NotificationDispatcher) {
    this.dispatcher = dispatcher;
  }

  start(pollIntervalMs = 3000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalHandle = setInterval(() => {
      this.processBatch().catch((err) => {
        console.error('[OutboxWorker] Error processing outbox batch:', err);
      });
    }, pollIntervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Process a single batch of pending outbox events using transaction row locking
   */
  async processBatch(limit = 10): Promise<number> {
    const client = await pgPool.connect();
    let processedCount = 0;

    try {
      await client.query('BEGIN');

      const selectRes = await client.query(
        `SELECT id, event_type, payload, retry_count
         FROM notify_svc.notification_outbox
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit]
      );

      const items: OutboxItem[] = selectRes.rows;

      for (const item of items) {
        try {
          await this.processItem(client, item);
          await client.query(
            `UPDATE notify_svc.notification_outbox
             SET status = 'processed', processed_at = NOW()
             WHERE id = $1`,
            [item.id]
          );
          processedCount++;
        } catch (itemErr: any) {
          const nextRetry = item.retry_count + 1;
          const newStatus = nextRetry >= 5 ? 'failed' : 'pending';
          await client.query(
            `UPDATE notify_svc.notification_outbox
             SET status = $1, retry_count = $2, last_error = $3
             WHERE id = $4`,
            [newStatus, nextRetry, itemErr.message || String(itemErr), item.id]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return processedCount;
  }

  /**
   * Dispatches notifications for a single outbox event
   */
  async processItem(client: any, item: OutboxItem) {
    const { event_type, payload } = item;
    const {
      bookingId,
      customerId,
      catererOwnerId,
      recipientPhone,
      catererPhone,
      catererName,
      eventDate,
      totalAmountINR,
      balanceDueINR,
      refundINR,
      recipientId,
      senderName,
      messagePreview,
    } = payload;

    switch (event_type) {
      case 'booking_requested': {
        // Caterer receives alert about new request
        if (catererOwnerId) {
          await this.dispatcher.sendWebPush(catererOwnerId, {
            title: 'New Booking Request!',
            body: `You have received a new catering request for ${eventDate || 'an upcoming event'}.`,
            data: { bookingId, url: `/bookings/${bookingId}` },
          });
        }
        if (catererPhone) {
          await this.dispatcher.sendWhatsApp(
            catererPhone,
            `[CaterConnect] New booking request received for ${eventDate}!`
          );
        }
        break;
      }

      case 'booking_accepted': {
        // Customer receives alert: booking accepted, payment required
        if (customerId) {
          await this.dispatcher.sendWebPush(customerId, {
            title: 'Booking Accepted!',
            body: `${catererName || 'Caterer'} accepted your request. Pay advance to confirm!`,
            data: { bookingId, url: `/bookings/${bookingId}` },
          });
        }
        if (recipientPhone) {
          await this.dispatcher.sendWhatsApp(
            recipientPhone,
            `[CaterConnect] Great news! ${catererName} accepted your booking for ${eventDate}. Total: ${totalAmountINR}.`
          );
        }
        break;
      }

      case 'booking_rejected': {
        // Customer receives alert: booking rejected
        if (customerId) {
          await this.dispatcher.sendWebPush(customerId, {
            title: 'Booking Update',
            body: `${catererName || 'Caterer'} was unavailable for ${eventDate}.`,
            data: { bookingId, url: `/bookings/${bookingId}` },
          });
        }
        break;
      }

      case 'booking_paid':
      case 'payment_captured': {
        // Both customer and caterer receive payment lock notification
        if (customerId) {
          await this.dispatcher.sendWebPush(customerId, {
            title: 'Payment Confirmed!',
            body: `Advance received. Your booking for ${eventDate} is confirmed!`,
            data: { bookingId, url: `/bookings/${bookingId}` },
          });
        }
        if (catererOwnerId) {
          await this.dispatcher.sendWebPush(catererOwnerId, {
            title: 'Booking Locked & Paid!',
            body: `Advance payment captured for booking on ${eventDate}.`,
            data: { bookingId, url: `/bookings/${bookingId}` },
          });
        }
        break;
      }

      case 'booking_cancelled': {
        // Notify other party
        if (customerId) {
          await this.dispatcher.sendWebPush(customerId, {
            title: 'Booking Cancelled',
            body: `Booking for ${eventDate} has been cancelled. Refund: ${refundINR || '₹0'}.`,
            data: { bookingId, url: `/bookings/${bookingId}` },
          });
        }
        if (catererOwnerId) {
          await this.dispatcher.sendWebPush(catererOwnerId, {
            title: 'Booking Cancelled',
            body: `Booking for ${eventDate} was cancelled.`,
            data: { bookingId, url: `/bookings/${bookingId}` },
          });
        }
        break;
      }

      case 'booking_completed': {
        // Customer receives review prompt
        if (customerId) {
          await this.dispatcher.sendWebPush(customerId, {
            title: 'Event Completed!',
            body: `How was your catering experience with ${catererName || 'your caterer'}? Leave a review!`,
            data: { bookingId, url: `/bookings/${bookingId}/review` },
          });
        }
        break;
      }

      case 'chat_message': {
        // Recipient receives new message alert
        if (recipientId) {
          await this.dispatcher.sendWebPush(recipientId, {
            title: `New message from ${senderName || 'CaterConnect'}`,
            body: messagePreview || 'You received a new message.',
            data: { url: `/chat/${bookingId}` },
          });
        }
        break;
      }

      default:
        console.warn(`[OutboxWorker] Unhandled event type: ${event_type}`);
    }
  }
}
