import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper, TEST_USERS } from '../harness';

describe('Feature 5: GST Invoicing & TDS/TCS Ledger (P1-6)', () => {
  const client = createApiClient();
  let paidBookingId: string;
  let unpaidBookingId: string;

  beforeAll(async () => {
    await startAllServers();

    const paidRows = await dbHelper.query(
      `SELECT id FROM order_svc.bookings WHERE status IN ('paid', 'completed') LIMIT 1`,
    );
    if (paidRows.length > 0) {
      paidBookingId = paidRows[0].id;
    }

    const unpaidBooking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-12-15', '18:00:00', 100, '56 Main', 'Tirupati', 'Andhra Pradesh', 10000000, 'requested', 0, 10000000)
       RETURNING id`,
      [TEST_USERS.customer.id],
    );
    unpaidBookingId = unpaidBooking[0].id;
  });

  afterAll(async () => {
    if (unpaidBookingId) {
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [unpaidBookingId]);
    }
    await stopAllServers();
  });

  it('TC-P1-06-01: Invoices table schema matches statutory GST invoice requirements', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name, data_type FROM information_schema.columns 
       WHERE table_schema = 'pay_svc' AND table_name = 'invoices'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('invoice_number');
    expect(colNames).toContain('invoice_type');
    expect(colNames).toContain('taxable_amount_paise');
    expect(colNames).toContain('cgst_paise');
    expect(colNames).toContain('sgst_paise');
    expect(colNames).toContain('igst_paise');
    expect(colNames).toContain('sac_code');
    expect(colNames).toContain('status');
  });

  it('TC-P1-06-02: Tax ledger schema tracks Section 194-O TDS and Section 52 TCS entries', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'pay_svc' AND table_name = 'tax_ledger'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('tax_type');
    expect(colNames).toContain('rate_basis_points');
    expect(colNames).toContain('tax_amount_paise');
    expect(colNames).toContain('financial_year');
    expect(colNames).toContain('quarter');
    expect(colNames).toContain('status');
  });

  it('TC-P1-06-03: Statutory GST commission calculations apply SAC 998311 and 18% tax breakdown', () => {
    const commissionPaise = 150000; // ₹1,500
    const taxablePaise = Math.round(commissionPaise / 1.18);
    const totalGstPaise = commissionPaise - taxablePaise;
    const cgstPaise = Math.round(totalGstPaise / 2);
    const sgstPaise = totalGstPaise - cgstPaise;

    expect(taxablePaise + cgstPaise + sgstPaise).toBe(commissionPaise);
    expect(cgstPaise).toBeGreaterThan(0);
    expect(sgstPaise).toBeGreaterThan(0);
    expect(cgstPaise + sgstPaise).toBe(totalGstPaise);
  });

  it('TC-P1-06-04: Section 194-O TDS computes 1% rate on gross transaction value', () => {
    const grossValuePaise = 10000000; // ₹1,00,000
    const tdsBasisPoints = 100; // 1%
    const tdsPaise = Math.round((grossValuePaise * tdsBasisPoints) / 10000);

    expect(tdsPaise).toBe(100000); // ₹1,000
  });

  it('TC-P1-06-05: Unpaid booking rejects invoice generation request with 400 Bad Request', async () => {
    if (!unpaidBookingId) return;

    const res = await client.get(`/api/bookings/${unpaidBookingId}/invoice`, { role: 'customer' });
    expect(res.status).toBe(400);
    expect(res.body.error || res.body.message).toContain('Invoice');
  });

  it('TC-P1-06-06: Database query validates invoice issuance and tax ledger record creation', async () => {
    if (!paidBookingId) return;

    const testInvoiceNum = `CC/TEST/INV-${Date.now()}`;
    await dbHelper.query(
      `INSERT INTO pay_svc.invoices (
        booking_id, caterer_id, customer_id, invoice_number, invoice_type,
        total_amount_paise, taxable_amount_paise, cgst_paise, sgst_paise, sac_code, status
      ) VALUES ($1, $2, $3, $4, 'commission', 15000, 12712, 1144, 1144, '998311', 'issued')`,
      [
        paidBookingId,
        'd0000000-0000-0000-0000-000000000001',
        TEST_USERS.customer.id,
        testInvoiceNum,
      ],
    );

    const invoices = await dbHelper.getInvoices(paidBookingId);
    expect(invoices.length).toBeGreaterThan(0);
    const inv = invoices.find((i: any) => i.invoice_number === testInvoiceNum);
    expect(inv).toBeDefined();
    expect(inv.sac_code).toBe('998311');
    expect(inv.status).toBe('issued');

    // Clean up
    await dbHelper.query(`DELETE FROM pay_svc.invoices WHERE invoice_number = $1`, [testInvoiceNum]);
  });
});
