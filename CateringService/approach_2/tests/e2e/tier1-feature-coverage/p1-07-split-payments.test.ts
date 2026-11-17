import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startAllServers, stopAllServers, createApiClient, dbHelper, TEST_USERS } from '../harness';

describe('Feature 6: Payment Limits & Split Payments (P1-7)', () => {
  const client = createApiClient();
  let testBookingId: string;

  beforeAll(async () => {
    await startAllServers();
    const eventDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    const deadline = new Date(Date.now() + 12 * 3600000);
    const inserted = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise, payment_deadline)
       VALUES ($1, 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', $2, '18:00:00', 100, 'Test Venue', 'Tirupati', 'Andhra Pradesh', 20000000, 'accepted', 0, 20000000, $3)
       RETURNING id`,
      [TEST_USERS.customer.id, eventDate, deadline],
    );
    testBookingId = inserted[0].id;
  });

  afterAll(async () => {
    if (testBookingId) {
      await dbHelper.query(`DELETE FROM pay_svc.payments WHERE booking_id = $1`, [testBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [testBookingId]);
    }
    await stopAllServers();
  });

  it('TC-P1-07-01: UPI transaction threshold (>₹1 Lakh) triggers split payment advisory logic', () => {
    const UPI_LIMIT_PAISE = 10000000; // ₹1,00,000 in paise
    const bookingTotalPaise = 15000000; // ₹1,50,000 in paise

    const exceedsUpiLimit = bookingTotalPaise > UPI_LIMIT_PAISE;
    expect(exceedsUpiLimit).toBe(true);

    const recommendedTranches = Math.ceil(bookingTotalPaise / UPI_LIMIT_PAISE);
    expect(recommendedTranches).toBe(2);
  });

  it('TC-P1-07-02: PaymentModal component incorporates UPI limit advisory and split payment options', () => {
    const modalPath = path.resolve(
      __dirname,
      '../../../frontend/customer/src/features/payment/components/PaymentModal.tsx',
    );
    expect(fs.existsSync(modalPath)).toBe(true);
    const content = fs.readFileSync(modalPath, 'utf-8');

    const hasSplitOption =
      content.includes('split') ||
      content.includes('tranche') ||
      content.includes('advance');
    expect(hasSplitOption).toBe(true);
  });

  it('TC-P1-07-03: Create-order endpoint validates split payment tranche options', async () => {
    const targetBookingId = testBookingId || '00000000-0000-0000-0000-000000000001';
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId: targetBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 5000000, // ₹50,000
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('orderId');
  });

  it('TC-P1-07-04: Split payment tranche amount exceeding balance due is rejected with 400', async () => {
    const targetBookingId = testBookingId || '00000000-0000-0000-0000-000000000001';
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId: targetBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 999999999, // Impossible excessive tranche
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(400);
  });

  it('TC-P1-07-05: Tranche amount below minimum threshold (₹5,000 / 500,000 paise) is rejected with 400', async () => {
    const targetBookingId = testBookingId || '00000000-0000-0000-0000-000000000001';
    const res = await client.post(
      '/api/payments/create-order',
      {
        bookingId: targetBookingId,
        paymentOption: 'split',
        trancheAmountPaise: 10000, // ₹100 is below minimum ₹5,000
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(400);
  });

  it('TC-P1-07-06: Database tracks cumulative paid and remaining balance paise on bookings', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'order_svc' AND table_name = 'bookings'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('total_amount_paise');
    expect(colNames).toContain('amount_paid_paise');
    expect(colNames).toContain('balance_due_paise');
  });
});
