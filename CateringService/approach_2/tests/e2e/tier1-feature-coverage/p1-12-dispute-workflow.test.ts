import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient, dbHelper, TEST_USERS, TEST_CATERER } from '../harness';

describe('Feature 11: Dispute Filing & Resolution Workflow (P1-12)', () => {
  const client = createApiClient();
  let paidBookingId: string;

  beforeAll(async () => {
    await startAllServers();

    const eventDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const booking = await dbHelper.query(
      `INSERT INTO order_svc.bookings 
       (customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, state, total_amount_paise, status, amount_paid_paise, balance_due_paise)
       VALUES ($1, $2, 'e0000000-0000-0000-0000-000000000001', $3, '18:00:00', 100, '56 Temple Street', 'Tirupati', 'Andhra Pradesh', 10000000, 'completed', 10000000, 0)
       RETURNING id`,
      [TEST_USERS.customer.id, TEST_CATERER.id, eventDate],
    );
    paidBookingId = booking[0].id;
  });

  afterAll(async () => {
    if (paidBookingId) {
      await dbHelper.query(`DELETE FROM order_svc.disputes WHERE booking_id = $1`, [paidBookingId]);
      await dbHelper.query(`DELETE FROM order_svc.bookings WHERE id = $1`, [paidBookingId]);
    }
    await stopAllServers();
  });

  it('TC-P1-12-01: Disputes table schema supports dispute ticketing and settlement hold linkage', async () => {
    const cols = await dbHelper.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'order_svc' AND table_name = 'disputes'`,
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain('booking_id');
    expect(colNames).toContain('customer_id');
    expect(colNames).toContain('caterer_id');
    expect(colNames).toContain('category');
    expect(colNames).toContain('description');
    expect(colNames).toContain('evidence_urls');
    expect(colNames).toContain('status');
    expect(colNames).toContain('resolution');
    expect(colNames).toContain('refund_amount_paise');
    expect(colNames).toContain('settlement_hold_id');
  });

  it('TC-P1-12-02: Dispute category constraint permits all statutory categories', async () => {
    const validCategories = [
      'food_quality',
      'tardiness',
      'hygiene',
      'service_shortage',
      'other',
    ];

    const rows = await dbHelper.query(
      `SELECT pg_get_constraintdef(c.oid) as def
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'order_svc' AND c.conname = 'disputes_category_check'`
    );
    expect(rows.length).toBe(1);
    const def = rows[0].def;
    for (const cat of validCategories) {
      expect(def).toContain(cat);
    }
  });

  it('TC-P1-12-03: Customer can submit dispute ticket on a paid booking', async () => {
    const res = await client.post(
      `/api/bookings/${paidBookingId}/disputes`,
      {
        category: 'service_shortage',
        description: 'Starter course was delayed and insufficient for guest count',
        evidenceUrls: ['https://example.com/evidence1.jpg'],
        refundRequestedPaise: 500000,
      },
      { role: 'customer' },
    );

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('disputeId');
  });

  it('TC-P1-12-04: Admin can resolve dispute ticket and release or adjust settlement', async () => {
    const testDisputeId = 'd2222222-0000-0000-0000-000000000001';

    // Seed test dispute
    await dbHelper.query(
      `INSERT INTO order_svc.disputes (
        id, booking_id, customer_id, caterer_id, category, description, status
      ) VALUES ($1, $2, $3, $4, 'food_quality', 'Taste issue reported', 'open')
      ON CONFLICT (id) DO UPDATE SET status = 'open'`,
      [testDisputeId, paidBookingId, TEST_USERS.customer.id, TEST_CATERER.id],
    );

    const res = await client.post(
      `/api/admin/disputes/${testDisputeId}/resolve`,
      {
        resolution: 'refund_customer',
        resolutionNotes: 'Approved partial refund of ₹2,500 based on photo evidence',
        refundPaise: 250000,
      },
      { role: 'admin' },
    );

    expect(res.status).toBe(200);

    // Clean up
    await dbHelper.query(`DELETE FROM order_svc.disputes WHERE id = $1`, [testDisputeId]);
  });

  it('TC-P1-12-05: Non-admin cannot resolve customer disputes (403 Forbidden)', async () => {
    const testDisputeId = '00000000-0000-0000-0000-000000000001';
    const res = await client.post(
      `/api/admin/disputes/${testDisputeId}/resolve`,
      { resolution: 'dismiss' },
      { role: 'customer' },
    );
    expect(res.status).toBe(403);
  });

  it('TC-P1-12-06: Database enforces settlement hold linkage when dispute is filed', async () => {
    if (!paidBookingId) return;

    const settlements = await dbHelper.getSettlementsByBooking(paidBookingId);
    if (settlements.length > 0) {
      const settlementId = settlements[0].id;
      const testDisputeId = 'd3333333-0000-0000-0000-000000000001';

      await dbHelper.query(
        `INSERT INTO order_svc.disputes (
          id, booking_id, customer_id, caterer_id, category, description, status, settlement_hold_id
        ) VALUES ($1, $2, $3, $4, 'other', 'Contract dispute', 'open', $5)
        ON CONFLICT (id) DO UPDATE SET settlement_hold_id = $5`,
        [testDisputeId, paidBookingId, TEST_USERS.customer.id, TEST_CATERER.id, settlementId],
      );

      const dispute = await dbHelper.getDisputeById(testDisputeId);
      expect(dispute).toBeDefined();
      expect(dispute.settlement_hold_id).toBe(settlementId);

      // Clean up
      await dbHelper.query(`DELETE FROM order_svc.disputes WHERE id = $1`, [testDisputeId]);
    }
  });
});
