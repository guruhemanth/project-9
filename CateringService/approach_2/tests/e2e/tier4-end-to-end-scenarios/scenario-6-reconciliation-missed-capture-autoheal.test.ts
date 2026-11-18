import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 4: Scenario 6 — Reconciliation Missed Capture & Auto-Heal Lifecycle', () => {
  const client = createApiClient();
  let bookingId: string;
  let runId: string;
  let paymentId: string;
  const catererId = TEST_CATERER.id;
  const totalAmountPaise = 5000000; // ₹50,000
  const advancePaise = 1250000;      // ₹12,500
  const rzpPaymentId = `pay_rzp_missed_${Date.now()}`;
  const rzpOrderId = `order_mock_heal_${Date.now()}`;

  beforeAll(async () => {
    await startAllServers();
    await dbHelper.query(
      `UPDATE caterer_svc.caterers SET status = 'approved' WHERE id = $1`,
      [catererId],
    );
  });

  afterAll(async () => {
    if (paymentId) {
      await dbHelper.query(`DELETE FROM pay_svc.payments WHERE id = $1`, [paymentId]);
    }
    if (runId) {
      await dbHelper.query(`DELETE FROM pay_svc.reconciliation_discrepancies WHERE run_id = $1`, [runId]);
      await dbHelper.query(`DELETE FROM pay_svc.reconciliation_runs WHERE id = $1`, [runId]);
    }
    if (bookingId) {
      await dbHelper.query(`DELETE FROM pay_svc.invoices WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.tax_ledger WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM notify_svc.notification_outbox WHERE payload->>'bookingId' = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.booking_status_history WHERE booking_id = $1`, [bookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [bookingId]);
    }
    await stopAllServers();
  });

  it('Step 1: Dropped Razorpay webhook leaves booking stuck in accepted status with uncaptured payment', async () => {
    const booking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', '2026-11-28', '19:00:00', 50, 'Main Hall', 'Tirupati', 'Andhra Pradesh', $3, 'accepted', 0, $3)
       RETURNING id, status`,
      [TEST_USERS.customer.id, catererId, totalAmountPaise],
    );
    bookingId = booking[0].id;

    const pmt = await dbHelper.query(
      `INSERT INTO pay_svc.payments 
       (booking_id, amount_paise, currency, status, payment_type, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, $2, 'INR', 'created', 'advance', $3, $4)
       RETURNING id, status, amount_paise`,
      [bookingId, advancePaise, rzpOrderId, rzpPaymentId],
    );
    paymentId = pmt[0].id;

    expect(booking[0].status).toBe('accepted');
    expect(pmt[0].status).toBe('created');
  });

  it('Step 2: Daily reconciliation job runs with autoHeal enabled via POST /api/admin/reconciliation/run', async () => {
    const res = await client.post(
      '/api/admin/reconciliation/run',
      {
        autoHeal: true,
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 60 * 1000).toISOString(),
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.runId).toBeDefined();
    runId = res.body.runId;

    const run = await dbHelper.query(
      `SELECT status FROM pay_svc.reconciliation_runs WHERE id = $1`,
      [runId],
    );
    expect(run[0].status).toBe('completed');
  });

  it('Step 3: Job flags discrepancy between Razorpay API and database and marks it auto_healed', async () => {
    const discs = await dbHelper.getReconciliationDiscrepancies(runId);
    expect(discs.length).toBeGreaterThan(0);
    const disc = discs.find(
      (d: any) => d.local_entity_id === paymentId || d.razorpay_entity_id === rzpPaymentId,
    );
    expect(disc).toBeDefined();
    expect(disc.status).toBe('auto_healed');
  });

  it('Step 4: Auto-heal transitions payment record to captured in pay_svc.payments', async () => {
    const pmt = await dbHelper.query(
      `SELECT id, status, amount_paise FROM pay_svc.payments WHERE id = $1`,
      [paymentId],
    );

    expect(pmt[0].status).toBe('captured');
    expect(pmt[0].amount_paise).toBe(advancePaise);
  });

  it('Step 5: Booking transitions to paid and balance due updates', async () => {
    const booking = await dbHelper.getBooking(bookingId);
    expect(booking.status).toBe('paid');
    expect(booking.amount_paid_paise).toBe(advancePaise);
    expect(booking.balance_due_paise).toBe(totalAmountPaise - advancePaise);
  });

  it('Step 6: Reconciliation auto-heal discrepancy audit trail confirms resolution', async () => {
    const run = await dbHelper.query(
      `SELECT status, auto_healed_count FROM pay_svc.reconciliation_runs WHERE id = $1`,
      [runId],
    );
    expect(run[0].status).toBe('completed');
    expect(run[0].auto_healed_count).toBeGreaterThan(0);
  });
});
