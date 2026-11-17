import pg from 'pg';
import { DATABASE_URL } from './fixtures';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });

    poolInstance.on('error', (err) => {
      console.error('[E2E DB Helper] Unexpected client error:', err.message);
    });
  }
  return poolInstance;
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getDbPool();
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

export async function closeDbPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export const dbHelper = {
  query,
  getDbPool,
  closeDbPool,

  async getReconciliationRuns(limit = 10) {
    return query(
      `SELECT * FROM pay_svc.reconciliation_runs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
  },

  async getReconciliationDiscrepancies(runId?: string) {
    if (runId) {
      return query(
        `SELECT * FROM pay_svc.reconciliation_discrepancies WHERE run_id = $1 ORDER BY created_at DESC`,
        [runId],
      );
    }
    return query(
      `SELECT * FROM pay_svc.reconciliation_discrepancies ORDER BY created_at DESC LIMIT 20`,
    );
  },

  async getSettlement(settlementId: string) {
    const rows = await query(
      `SELECT * FROM pay_svc.caterer_settlements WHERE id = $1`,
      [settlementId],
    );
    return rows[0] || null;
  },

  async getSettlementsByBooking(bookingId: string) {
    return query(
      `SELECT * FROM pay_svc.caterer_settlements WHERE booking_id = $1 ORDER BY created_at DESC`,
      [bookingId],
    );
  },

  async getInvoices(bookingId: string) {
    return query(
      `SELECT * FROM pay_svc.invoices WHERE booking_id = $1 ORDER BY created_at DESC`,
      [bookingId],
    );
  },

  async getTaxLedger(bookingId?: string) {
    if (bookingId) {
      return query(
        `SELECT * FROM pay_svc.tax_ledger WHERE booking_id = $1 ORDER BY created_at DESC`,
        [bookingId],
      );
    }
    return query(`SELECT * FROM pay_svc.tax_ledger ORDER BY created_at DESC LIMIT 20`);
  },

  async getPenalties(catererId?: string) {
    if (catererId) {
      return query(
        `SELECT * FROM pay_svc.caterer_penalties WHERE caterer_id = $1 ORDER BY created_at DESC`,
        [catererId],
      );
    }
    return query(`SELECT * FROM pay_svc.caterer_penalties ORDER BY created_at DESC LIMIT 20`);
  },

  async getDisputes(bookingId?: string) {
    if (bookingId) {
      return query(
        `SELECT * FROM order_svc.disputes WHERE booking_id = $1 ORDER BY created_at DESC`,
        [bookingId],
      );
    }
    return query(`SELECT * FROM order_svc.disputes ORDER BY created_at DESC LIMIT 20`);
  },

  async getDisputeById(disputeId: string) {
    const rows = await query(`SELECT * FROM order_svc.disputes WHERE id = $1`, [disputeId]);
    return rows[0] || null;
  },

  async getReminders(bookingId?: string) {
    if (bookingId) {
      return query(
        `SELECT * FROM notify_svc.reminders_sent WHERE booking_id = $1 ORDER BY sent_at DESC`,
        [bookingId],
      );
    }
    return query(`SELECT * FROM notify_svc.reminders_sent ORDER BY sent_at DESC LIMIT 20`);
  },

  async getOutboxMessages(limit = 20) {
    return query(
      `SELECT * FROM notify_svc.notification_outbox ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
  },

  async getCaterer(catererId: string) {
    const rows = await query(`SELECT * FROM caterer_svc.caterers WHERE id = $1`, [catererId]);
    return rows[0] || null;
  },

  async getCatererDocuments(catererId: string) {
    return query(
      `SELECT * FROM caterer_svc.caterer_documents WHERE caterer_id = $1 ORDER BY created_at DESC`,
      [catererId],
    );
  },

  async getBooking(bookingId: string) {
    const rows = await query(`SELECT * FROM order_svc.bookings WHERE id = $1`, [bookingId]);
    return rows[0] || null;
  },
};
