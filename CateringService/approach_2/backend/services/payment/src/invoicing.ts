import { pgPool } from './db';

export function getIndianFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr
  const year = date.getFullYear();
  if (month >= 3) {
    const nextYearShort = (year + 1).toString().slice(-2);
    return `${year}-${nextYearShort}`;
  } else {
    const yearShort = year.toString().slice(-2);
    return `${year - 1}-${yearShort}`;
  }
}

export function getQuarter(date: Date = new Date()): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const month = date.getMonth(); // 0 = Jan
  if (month >= 3 && month <= 5) return 'Q1'; // Apr - Jun
  if (month >= 6 && month <= 8) return 'Q2'; // Jul - Sep
  if (month >= 9 && month <= 11) return 'Q3'; // Oct - Dec
  return 'Q4'; // Jan - Mar
}

export async function generateInvoiceNumber(client: any, fy: string): Promise<string> {
  const prefix = `CC/${fy}/INV-`;

  // Acquire PostgreSQL transaction advisory lock scoped to this financial year
  // hashtext provides a deterministic 32-bit integer key from the string
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invoice_sequence_${fy}`]);

  const res = await client.query(
    `SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM 'INV-(\\d+)$')::integer), 0) AS max_seq
     FROM pay_svc.invoices
     WHERE invoice_number LIKE 'CC/' || $1 || '/INV-%'`,
    [fy]
  );

  const maxSeq = parseInt(res.rows[0]?.max_seq, 10) || 0;
  const nextSeq = maxSeq + 1;

  return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
}

export async function generateInvoiceAndTaxRecords(client: any, bookingId: string) {
  // Query booking and caterer info
  const bRes = await client.query(
    `SELECT b.id, b.customer_id, b.caterer_id, b.status, b.total_amount_paise, 
            b.commission_amount_paise, b.commission_pct, b.state as booking_state,
            c.state as caterer_state
     FROM order_svc.bookings b
     JOIN caterer_svc.caterers c ON b.caterer_id = c.id
     WHERE b.id = $1`,
    [bookingId]
  );

  if (bRes.rows.length === 0) {
    return null;
  }

  const booking = bRes.rows[0];
  const totalBookingPaise = booking.total_amount_paise || 0;
  let commissionPaise = booking.commission_amount_paise || 0;

  if (commissionPaise <= 0) {
    const pct = parseFloat(booking.commission_pct || '15.00');
    commissionPaise = Math.round((totalBookingPaise * pct) / 100);
  }

  // Statutory GST Breakdown: 18% GST (SAC 998311)
  const taxablePaise = Math.round(commissionPaise / 1.18);
  const totalGstPaise = commissionPaise - taxablePaise;

  const isIntraState = !booking.caterer_state || booking.caterer_state.toLowerCase() === 'andhra pradesh';
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isIntraState) {
    cgstPaise = Math.round(totalGstPaise / 2);
    sgstPaise = totalGstPaise - cgstPaise;
  } else {
    igstPaise = totalGstPaise;
  }

  const now = new Date();
  const fy = getIndianFinancialYear(now);
  const quarter = getQuarter(now);

  // Check if invoice already exists
  const existingInv = await client.query(
    `SELECT * FROM pay_svc.invoices WHERE booking_id = $1 LIMIT 1`,
    [bookingId]
  );

  let invoice = existingInv.rows[0];

  if (!invoice) {
    // Acquire PostgreSQL transaction advisory lock to prevent concurrent duplicates for the same booking
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invoice_sequence_${fy}`]);

    const recheckInv = await client.query(
      `SELECT * FROM pay_svc.invoices WHERE booking_id = $1 LIMIT 1`,
      [bookingId]
    );

    if (recheckInv.rows.length > 0) {
      invoice = recheckInv.rows[0];
    } else {
      const invoiceNumber = await generateInvoiceNumber(client, fy);
      const lineItems = [
        {
          description: 'Platform Commission Service Fee',
          sacCode: '998311',
          taxableAmountPaise: taxablePaise,
          cgstPaise,
          sgstPaise,
          igstPaise,
          totalAmountPaise: commissionPaise,
        },
      ];

      const invRes = await client.query(
        `INSERT INTO pay_svc.invoices (
           booking_id, caterer_id, customer_id, invoice_number, invoice_type,
           total_amount_paise, taxable_amount_paise, cgst_paise, sgst_paise, igst_paise,
           sac_code, status, line_items
         ) VALUES ($1, $2, $3, $4, 'commission', $5, $6, $7, $8, $9, '998311', 'issued', $10)
         RETURNING *`,
        [
          bookingId,
          booking.caterer_id,
          booking.customer_id,
          invoiceNumber,
          commissionPaise,
          taxablePaise,
          cgstPaise,
          sgstPaise,
          igstPaise,
          JSON.stringify(lineItems),
        ]
      );
      invoice = invRes.rows[0];
    }
  }

  // Record Section 194-O TDS (1%) and Section 52 TCS (1%) in pay_svc.tax_ledger
  const tdsBasisPoints = 100; // 1%
  const tdsPaise = Math.round((totalBookingPaise * tdsBasisPoints) / 10000);

  const tcsBasisPoints = 100; // 1%
  const tcsPaise = Math.round((totalBookingPaise * tcsBasisPoints) / 10000);

  // Check existing tax entries
  const existingTax = await client.query(
    `SELECT id, tax_type FROM pay_svc.tax_ledger WHERE booking_id = $1`,
    [bookingId]
  );
  const existingTypes = new Set(existingTax.rows.map((r: any) => r.tax_type));

  if (!existingTypes.has('tds_194o')) {
    await client.query(
      `INSERT INTO pay_svc.tax_ledger (
         booking_id, caterer_id, entity_type, entity_id, tax_type,
         rate_basis_points, taxable_amount_paise, tax_amount_paise,
         financial_year, quarter, status
       ) VALUES ($1, $2, 'caterer', $3, 'tds_194o', $4, $5, $6, $7, $8, 'accrued')`,
      [
        bookingId,
        booking.caterer_id,
        booking.caterer_id,
        tdsBasisPoints,
        totalBookingPaise,
        tdsPaise,
        fy,
        quarter,
      ]
    );
  }

  if (!existingTypes.has('tcs_section_52')) {
    await client.query(
      `INSERT INTO pay_svc.tax_ledger (
         booking_id, caterer_id, entity_type, entity_id, tax_type,
         rate_basis_points, taxable_amount_paise, tax_amount_paise,
         financial_year, quarter, status
       ) VALUES ($1, $2, 'caterer', $3, 'tcs_section_52', $4, $5, $6, $7, $8, 'accrued')`,
      [
        bookingId,
        booking.caterer_id,
        booking.caterer_id,
        tcsBasisPoints,
        totalBookingPaise,
        tcsPaise,
        fy,
        quarter,
      ]
    );
  }

  return invoice;
}
