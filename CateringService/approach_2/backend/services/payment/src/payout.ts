import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuthenticatedUser } from '@caterconnect/shared';
import { pgPool } from './db';
import { sendPaymentAlertWebhook } from './alerts';

export function computePayoutBackoffMinutes(retryCount: number): number {
  return Math.min(5 * Math.pow(3, retryCount), 60);
}

export interface PayoutExecutionResult {
  success: boolean;
  payoutId?: string;
  status: string;
  retryCount: number;
  nextRetryAt?: string | null;
  error?: string;
}

export async function executeSettlementPayout(
  settlementId: string,
  force = false,
  logger?: any
): Promise<PayoutExecutionResult> {
  const sRes = await pgPool.query(
    `SELECT s.*, 
            c.bank_account_number, c.bank_ifsc, c.business_name,
            b.event_date, b.status as booking_status
     FROM pay_svc.caterer_settlements s
     JOIN caterer_svc.caterers c ON s.caterer_id = c.id
     JOIN order_svc.bookings b ON s.booking_id = b.id
     WHERE s.id = $1`,
    [settlementId]
  );

  if (sRes.rows.length === 0) {
    return {
      success: false,
      status: 'not_found',
      retryCount: 0,
      error: 'Settlement not found',
    };
  }

  const s = sRes.rows[0];

  // Safety checks (P0-11)
  if (s.status === 'held') {
    return {
      success: false,
      status: 'held',
      retryCount: s.retry_count || 0,
      error: 'SETTLEMENT_HELD: Settlement is held pending dispute resolution',
    };
  }

  if (s.booking_status === 'cancelled') {
    return {
      success: false,
      status: 'cancelled',
      retryCount: s.retry_count || 0,
      error: 'BOOKING_CANCELLED: Cannot disburse payout for cancelled booking',
    };
  }

  if (!force) {
    const today = new Date().toISOString().split('T')[0];
    const eventDate = typeof s.event_date === 'string' ? s.event_date.split('T')[0] : s.event_date?.toISOString?.().split('T')[0];
    if (s.booking_status !== 'completed' && eventDate && eventDate > today) {
      return {
        success: false,
        status: s.status,
        retryCount: s.retry_count || 0,
        error: 'EVENT_IN_FUTURE: Payout cannot be disbursed prior to event completion or passage',
      };
    }
  }

  if (!s.bank_account_number || !s.bank_ifsc) {
    return {
      success: false,
      status: s.status,
      retryCount: s.retry_count || 0,
      error: 'BANK_DETAILS_MISSING: Caterer bank account details are missing or incomplete',
    };
  }

  const currentRetry = force ? 0 : s.retry_count || 0;

  // Execute payout (in dev/test/offline simulate deterministically)
  const isProduction = process.env.NODE_ENV === 'production';
  let simulatedSuccess = true;
  let payoutId = `pout_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  if (isProduction && process.env.RAZORPAYX_ACCOUNT_NUMBER) {
    // In production, execute live RazorpayX payout call
    try {
      // Mock / placeholder for live API call
      simulatedSuccess = true;
    } catch (err: any) {
      simulatedSuccess = false;
    }
  }

  if (simulatedSuccess) {
    await pgPool.query(
      `UPDATE pay_svc.caterer_settlements
       SET payout_id = $1,
           payout_status = 'processed',
           status = 'settled',
           retry_count = $2,
           next_retry_at = NULL,
           last_error = NULL,
           settled_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [payoutId, currentRetry, settlementId]
    );

    return {
      success: true,
      payoutId,
      status: 'settled',
      retryCount: currentRetry,
    };
  } else {
    const nextRetryCount = currentRetry + 1;
    const isExhausted = nextRetryCount >= 3;
    const backoffMinutes = computePayoutBackoffMinutes(currentRetry);
    const nextRetryAt = isExhausted ? null : new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    const newStatus = isExhausted ? 'failed' : s.status;
    const errorMsg = 'Bank transfer failed via RazorpayX';

    await pgPool.query(
      `UPDATE pay_svc.caterer_settlements
       SET payout_status = 'failed',
           status = $1,
           retry_count = $2,
           next_retry_at = $3,
           last_error = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [newStatus, nextRetryCount, nextRetryAt, errorMsg, settlementId]
    );

    if (isExhausted) {
      await sendPaymentAlertWebhook(
        {
          alertType: 'PAYOUT_FAILED',
          severity: 'CRITICAL',
          message: `Payout failed and retries exhausted (3/3) for settlement ${settlementId}`,
          details: {
            settlementId,
            catererId: s.caterer_id,
            bookingId: s.booking_id,
            retryCount: nextRetryCount,
            error: errorMsg,
          },
        },
        logger
      );
    }

    return {
      success: false,
      payoutId,
      status: newStatus,
      retryCount: nextRetryCount,
      nextRetryAt,
      error: errorMsg,
    };
  }
}

export function registerPayoutRoutes(server: FastifyInstance) {
  // POST /api/admin/settlements/:id/retry
  server.post('/api/admin/settlements/:id/retry', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user || user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required to retry settlements' });
      }

      const { id } = req.params as { id: string };
      const body = (req.body as any) || {};
      const force = Boolean(body.force);

      const result = await executeSettlementPayout(id, force, req.log);
      if (!result.success) {
        if (result.status === 'not_found') {
          return reply.status(404).send({ error: result.error });
        }
        if (result.error?.includes('BANK_DETAILS_MISSING')) {
          return reply.status(422).send({ error: result.error });
        }
        return reply.status(400).send({ error: result.error });
      }

      return reply.send({
        success: true,
        payoutId: result.payoutId,
        status: result.status,
        retryCount: result.retryCount,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: err.message || 'Failed to retry settlement' });
    }
  });
}
