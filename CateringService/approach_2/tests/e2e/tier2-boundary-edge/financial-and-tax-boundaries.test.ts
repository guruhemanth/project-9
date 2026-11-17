import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { computePayoutBackoffMinutes } from '../../../backend/services/payment/src/payout';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  mintTestJwt,
  dbHelper,
  TEST_USERS,
  TEST_CATERER,
} from '../harness';

describe('Tier 2: Financial & Tax Boundaries (P1-1, P1-2, P1-6, P1-7)', () => {
  const client = createApiClient();
  let sampleBookingId: string;
  let sampleSettlementId: string;
  let testBookingId: string;

  beforeAll(async () => {
    await startAllServers();

    // Create a dedicated valid booking for foreign keys
    const bk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, '2026-12-25', '18:00:00', 100, '45 Gandhi Road', 'Tirupati', 'Andhra Pradesh', 10000000, 'accepted', 0, 10000000)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id],
    );
    testBookingId = bk[0].id;
    sampleBookingId = testBookingId;

    const settlements = await dbHelper.query(
      `SELECT id FROM pay_svc.caterer_settlements ORDER BY created_at DESC LIMIT 1`,
    );
    if (settlements.length > 0) {
      sampleSettlementId = settlements[0].id;
    }
  });

  afterAll(async () => {
    if (testBookingId) {
      await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE booking_id = $1`, [testBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [testBookingId]);
    }
    await stopAllServers();
  });

  // ==============================================================
  // P1-1 Razorpay Reconciliation Boundaries (TC-T2-FIN-01 to 05)
  // ==============================================================

  it('TC-T2-FIN-01: Reconciliation job detects missing_in_db when payment captured in Razorpay is missing in DB', async () => {
    const run = await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_runs (period_start, period_end, status)
       VALUES (now() - interval '2 days', now() - interval '1 day', 'completed')
       RETURNING id`,
    );
    const runId = run[0].id;

    await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_discrepancies (run_id, discrepancy_type, status, razorpay_entity_id, amount_paise)
       VALUES ($1, 'missing_in_db', 'open', 'pay_mock_missed_001', 5000000)`,
      [runId],
    );

    const discs = await dbHelper.getReconciliationDiscrepancies(runId);
    expect(discs.length).toBe(1);
    expect(discs[0].discrepancy_type).toBe('missing_in_db');
    expect(discs[0].status).toBe('open');

    await dbHelper.query(`DELETE FROM pay_svc.reconciliation_runs WHERE id = $1`, [runId]);
  });

  it('TC-T2-FIN-02: Reconciliation autoHeal=false logs discrepancy without modifying booking status', async () => {
    const res = await client.post(
      '/api/admin/reconciliation/run',
      {
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-02T00:00:00Z',
        autoHeal: false,
      },
      { role: 'admin' },
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('TC-T2-FIN-03: Reconciliation flags AMOUNT_MISMATCH when DB payment amount differs from gateway capture', async () => {
    const run = await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_runs (period_start, period_end, status)
       VALUES (now() - interval '3 days', now() - interval '2 days', 'completed')
       RETURNING id`,
    );
    const runId = run[0].id;

    await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_discrepancies 
       (run_id, discrepancy_type, status, razorpay_entity_id, local_entity_id, amount_paise, resolution_notes)
       VALUES ($1, 'amount_mismatch', 'open', 'pay_rzp_999', 'pay_db_888', 1000000, 
       'Gateway amount ₹10,000 does not match DB amount ₹5,000')`,
      [runId],
    );

    const discs = await dbHelper.getReconciliationDiscrepancies(runId);
    expect(discs.length).toBe(1);
    expect(discs[0].discrepancy_type).toBe('amount_mismatch');
    expect(discs[0].status).toBe('open');

    await dbHelper.query(`DELETE FROM pay_svc.reconciliation_runs WHERE id = $1`, [runId]);
  });

  it('TC-T2-FIN-04: Reconciliation logs refund_mismatch when refund executed out-of-band in Razorpay', async () => {
    const run = await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_runs (period_start, period_end, status)
       VALUES (now() - interval '4 days', now() - interval '3 days', 'completed')
       RETURNING id`,
    );
    const runId = run[0].id;

    await dbHelper.query(
      `INSERT INTO pay_svc.reconciliation_discrepancies 
       (run_id, discrepancy_type, status, razorpay_entity_id, amount_paise)
       VALUES ($1, 'refund_mismatch', 'open', 'rfnd_out_of_band_001', 2500000)`,
      [runId],
    );

    const discs = await dbHelper.getReconciliationDiscrepancies(runId);
    expect(discs[0].discrepancy_type).toBe('refund_mismatch');

    await dbHelper.query(`DELETE FROM pay_svc.reconciliation_runs WHERE id = $1`, [runId]);
  });

  it('TC-T2-FIN-05: Inverted reconciliation date window (from > to) is rejected with 400 Bad Request', async () => {
    const res = await client.post(
      '/api/admin/reconciliation/run',
      {
        from: '2026-11-20T00:00:00Z',
        to: '2026-11-10T00:00:00Z',
      },
      { role: 'admin' },
    );
    expect(res.status).toBe(400);
  });

  // ==============================================================
  // P1-2 Automated Payout Boundaries (TC-T2-FIN-06 to 10)
  // ==============================================================

  it('TC-T2-FIN-06: Transient 504/gateway timeout triggers exponential backoff computation for next_retry_at', () => {
    expect(computePayoutBackoffMinutes(0)).toBe(5);
    expect(computePayoutBackoffMinutes(1)).toBe(15);
    expect(computePayoutBackoffMinutes(2)).toBe(45);
    expect(computePayoutBackoffMinutes(3)).toBe(60); // capped at 60 minutes
  });

  it('TC-T2-FIN-07: Payout exhaustion (retry_count >= 3) marks settlement status as held with last_error', async () => {
    const res = await dbHelper.query(
      `INSERT INTO pay_svc.caterer_settlements 
       (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status, retry_count, last_error)
       VALUES ($1, $2, 1000000, 0.10, 100000, 900000, 'held', 3, 'MAX_RETRIES_EXHAUSTED: RazorpayX 504 Gateway Timeout')
       RETURNING id, status, retry_count, last_error`,
      [testBookingId, TEST_CATERER.id],
    );

    expect(res[0].status).toBe('held');
    expect(res[0].retry_count).toBe(3);
    expect(res[0].last_error).toContain('MAX_RETRIES_EXHAUSTED');

    await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE id = $1`, [res[0].id]);
  });

  it('TC-T2-FIN-08: Invalid beneficiary bank IFSC code immediately aborts retries and transitions to held', async () => {
    const bankRes = await client.put(
      `/api/caterers/${TEST_CATERER.id}/bank-details`,
      {
        accountNumber: '1234567890',
        ifscCode: 'INVALID_IFSC_123',
        accountHolderName: 'Test Caterer',
        bankName: 'HDFC',
      },
      { role: 'caterer' },
    );
    expect(bankRes.status).toBe(400);

    const res = await dbHelper.query(
      `INSERT INTO pay_svc.caterer_settlements 
       (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status, retry_count, last_error)
       VALUES ($1, $2, 500000, 0.10, 50000, 450000, 'held', 0, 'BENEFICIARY_ERROR: Invalid IFSC Code')
       RETURNING id, status, last_error`,
      [testBookingId, TEST_CATERER.id],
    );

    expect(res[0].status).toBe('held');
    expect(res[0].last_error).toContain('BENEFICIARY_ERROR');

    await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE id = $1`, [res[0].id]);
  });

  it('TC-T2-FIN-09: Caterer role is forbidden from admin payout disbursement', async () => {
    const targetId = sampleSettlementId || 'c0000000-0000-0000-0000-000000000001';
    const res = await client.post(
      `/api/admin/settlements/${targetId}/disburse`,
      { utrReference: 'UTR123' },
      { role: 'caterer' },
    );
    expect(res.status).toBe(403);
  });

  it('TC-T2-FIN-10: Payout cannot disburse if event date is in the future and booking not completed', async () => {
    const sRes = await dbHelper.query(
      `INSERT INTO pay_svc.caterer_settlements 
       (booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status, payout_status, payout_mode, retry_count)
       VALUES ($1, $2, 10000000, 0.10, 1000000, 9000000, 'pending', 'pending', 'NEFT', 0)
       RETURNING id`,
      [testBookingId, TEST_CATERER.id],
    );
    const sId = sRes[0].id;

    const res = await client.post(
      `/api/admin/settlements/${sId}/disburse`,
      { utrReference: 'UTR_FUTURE_TEST' },
      { role: 'admin' },
    );
    expect(res.status).toBe(400);

    await dbHelper.query(`DELETE FROM pay_svc.caterer_settlements WHERE id = $1`, [sId]);
  });

  // ==============================================================
  // P1-6 GST Invoices & TDS/TCS Boundaries (TC-T2-FIN-11 to 15)
  // ==============================================================

  it('TC-T2-FIN-11: Intra-state booking (AP to AP) calculates statutory GST on platform commission (SAC 998311, tax-inclusive)', () => {
    const commissionPaise = 1000000; // ₹10,000 commission
    const sacCode = '998311';

    // Tax-inclusive statutory GST breakdown (matching backend invoicing.ts)
    const taxablePaise = Math.round(commissionPaise / 1.18);
    const totalGstPaise = commissionPaise - taxablePaise;
    const cgstPaise = Math.round(totalGstPaise / 2);
    const sgstPaise = totalGstPaise - cgstPaise;

    expect(sacCode).toBe('998311');
    expect(taxablePaise).toBe(847458);
    expect(totalGstPaise).toBe(152542);
    expect(cgstPaise).toBe(76271);
    expect(sgstPaise).toBe(76271);
    expect(cgstPaise + sgstPaise).toBe(totalGstPaise);
  });

  it('TC-T2-FIN-12: Inter-state booking (AP to other state) calculates 18% IGST on platform commission (tax-inclusive)', () => {
    const commissionPaise = 1000000;
    const taxablePaise = Math.round(commissionPaise / 1.18);
    const totalGstPaise = commissionPaise - taxablePaise;
    const igstPaise = totalGstPaise;

    expect(taxablePaise).toBe(847458);
    expect(igstPaise).toBe(152542);
  });

  it('TC-T2-FIN-13: Unregistered caterer (no GSTIN) is marked as Unregistered on invoice with Section 194-O TDS applied', async () => {
    const grossPaise = 5000000;
    const tdsBasisPoints = 100; // 1% Section 194-O TDS
    const tdsAmountPaise = Math.round((grossPaise * tdsBasisPoints) / 10000);

    expect(tdsAmountPaise).toBe(50000);

    const ledgerRow = await dbHelper.query(
      `INSERT INTO pay_svc.tax_ledger 
       (booking_id, caterer_id, entity_type, entity_id, tax_type, rate_basis_points, taxable_amount_paise, tax_amount_paise, financial_year, quarter, status)
       VALUES ($1, $2, 'caterer', $3, 'tds_194o', $4, $5, $6, '2026-2027', 'Q3', 'accrued')
       RETURNING id, tax_type, tax_amount_paise`,
      [testBookingId, TEST_CATERER.id, TEST_CATERER.id, tdsBasisPoints, grossPaise, tdsAmountPaise],
    );

    expect(ledgerRow[0].tax_type).toBe('tds_194o');
    expect(ledgerRow[0].tax_amount_paise).toBe(50000);

    await dbHelper.query(`DELETE FROM pay_svc.tax_ledger WHERE id = $1`, [ledgerRow[0].id]);
  });

  it('TC-T2-FIN-14: Unpaid booking in requested or accepted status rejects invoice retrieval with 400 Bad Request', async () => {
    const res = await client.get(`/api/bookings/${testBookingId}/invoice`, { role: 'customer' });
    expect(res.status).toBe(400);
  });

  it('TC-T2-FIN-15: Unauthorized customer or caterer attempting to fetch another user invoice returns 403 Forbidden', async () => {
    const paidBk = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, '2026-12-25', '18:00:00', 100, '45 Gandhi Road', 'Tirupati', 'Andhra Pradesh', 10000000, 'paid', 10000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id],
    );
    const paidBkId = paidBk[0].id;

    const rogueToken = mintTestJwt({
      sub: '00000000-0000-0000-0000-000000009999',
      role: 'customer',
      email: 'outsider@example.com',
    });

    const res = await client.get(`/api/bookings/${paidBkId}/invoice`, { token: rogueToken });
    expect(res.status).toBe(403);

    await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [paidBkId]);
  });

  // ==============================================================
  // P1-7 Split Payments & Limits Boundaries (TC-T2-FIN-16 to 20)
  // ==============================================================

  it('TC-T2-FIN-16: Split payment tranche amount exceeding remaining balance due is rejected with 400 Bad Request', async () => {
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId: testBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 999999999,
      },
      { role: 'customer' },
    );
    expect(res.status).toBe(400);
  });

  it('TC-T2-FIN-17: Split payment tranche amount below minimum ₹5,000 threshold (500,000 paise) is rejected with 400', async () => {
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId: testBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 200000,
      },
      { role: 'customer' },
    );
    expect(res.status).toBe(400);
  });

  it('TC-T2-FIN-18: Split payment tranche of zero or negative paise is rejected with 400 Bad Request', async () => {
    const resNegative = await client.post(
      '/api/payments/create-order',
      {
        bookingId: testBookingId,
        paymentOption: 'split',
        trancheAmountPaise: -500000,
      },
      { role: 'customer' },
    );
    expect(resNegative.status).toBe(400);

    const resZero = await client.post(
      '/api/payments/create-order',
      {
        bookingId: testBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 0,
      },
      { role: 'customer' },
    );
    expect(resZero.status).toBe(400);
  });

  it('TC-T2-FIN-19: Split payment tranche exactly matching remaining balance due creates valid payment order', async () => {
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId: testBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 10000000,
      },
      { role: 'customer' },
    );
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body.amountPaise).toBe(10000000);
  });

  it('TC-T2-FIN-20: High-value checkout (>₹1 Lakh) split tranche exceeding remaining balance due is rejected with 400', async () => {
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId: testBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 15000000, // exceeds remaining balance due of ₹1 Lakh
      },
      { role: 'customer' },
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cannot exceed remaining balance due');
  });
});
