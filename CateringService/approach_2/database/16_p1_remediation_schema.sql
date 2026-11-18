-- Migration 16: P1 Remediation Schema
-- Covers:
--  P1-1: Daily reconciliation runs & discrepancies (pay_svc)
--  P1-2: Automated payout execution columns on caterer_settlements (pay_svc)
--  P1-6: Statutory GST invoices & tax ledger (pay_svc)
--  P1-8: Caterer onboarding queue granular statuses & correction notes (caterer_svc)
--  P1-9: Caterer documents private file storage & HMAC signed URL tokens (caterer_svc)
--  P1-10: Late cancellation penalties & rebooking tracking (pay_svc & order_svc)
--  P1-11: Booking reminder notifications deduplication (notify_svc)
--  P1-12: Customer dispute ticketing workflow & settlement holds (order_svc)

-- ============================================================================
-- 1. P1-1: Daily Reconciliation Runs & Discrepancies
-- ============================================================================

CREATE TABLE IF NOT EXISTS pay_svc.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'reconciled')),
  total_records integer NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  matched_count integer NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
  discrepancy_count integer NOT NULL DEFAULT 0 CHECK (discrepancy_count >= 0),
  auto_healed_count integer NOT NULL DEFAULT 0 CHECK (auto_healed_count >= 0),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status ON pay_svc.reconciliation_runs (status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_period ON pay_svc.reconciliation_runs (period_start, period_end);

CREATE TABLE IF NOT EXISTS pay_svc.reconciliation_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES pay_svc.reconciliation_runs(id) ON DELETE CASCADE,
  discrepancy_type text NOT NULL CHECK (discrepancy_type IN ('amount_mismatch', 'status_mismatch', 'missing_in_db', 'missing_in_gateway', 'refund_mismatch', 'other')),
  razorpay_entity_id text,
  local_entity_id text,
  amount_paise integer CHECK (amount_paise IS NULL OR amount_paise >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'auto_healed', 'ignored')),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_run ON pay_svc.reconciliation_discrepancies (run_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_status ON pay_svc.reconciliation_discrepancies (status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_rzp_id ON pay_svc.reconciliation_discrepancies (razorpay_entity_id) WHERE razorpay_entity_id IS NOT NULL;

-- ============================================================================
-- 2. P1-2: Automated Payout Execution Columns on Caterer Settlements
-- ============================================================================

ALTER TABLE pay_svc.caterer_settlements
  ADD COLUMN IF NOT EXISTS payout_id text,
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'queued', 'processing', 'processed', 'reversed', 'cancelled', 'rejected', 'failed')),
  ADD COLUMN IF NOT EXISTS payout_mode text NOT NULL DEFAULT 'NEFT'
    CHECK (payout_mode IN ('NEFT', 'RTGS', 'IMPS', 'UPI')),
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Allow status to include 'failed' in addition to pending, processing, settled, held
ALTER TABLE pay_svc.caterer_settlements DROP CONSTRAINT IF EXISTS caterer_settlements_status_check;
ALTER TABLE pay_svc.caterer_settlements ADD CONSTRAINT caterer_settlements_status_check
  CHECK (status IN ('pending', 'processing', 'settled', 'held', 'failed'));

CREATE INDEX IF NOT EXISTS idx_caterer_settlements_payout_id ON pay_svc.caterer_settlements (payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_caterer_settlements_payout_status ON pay_svc.caterer_settlements (payout_status);
CREATE INDEX IF NOT EXISTS idx_caterer_settlements_retry ON pay_svc.caterer_settlements (next_retry_at) WHERE payout_status IN ('pending', 'queued', 'processing', 'failed') AND next_retry_at IS NOT NULL;

-- ============================================================================
-- 3. P1-6: Statutory GST Invoices & Tax Ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS pay_svc.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES order_svc.bookings(id) ON DELETE CASCADE,
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth_svc.users(id) ON DELETE CASCADE,
  invoice_number text UNIQUE NOT NULL,
  invoice_type text NOT NULL DEFAULT 'commission' CHECK (invoice_type IN ('commission', 'customer_receipt', 'caterer_settlement', 'commission_invoice', 'customer_invoice', 'platform_fee', 'platform_commission', 'customer_booking')),
  total_amount_paise integer NOT NULL CHECK (total_amount_paise >= 0),
  taxable_amount_paise integer NOT NULL CHECK (taxable_amount_paise >= 0),
  cgst_paise integer NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise integer NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise integer NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  sac_code text NOT NULL DEFAULT '998311',
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'void', 'paid')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON pay_svc.invoices (booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_caterer_id ON pay_svc.invoices (caterer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON pay_svc.invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON pay_svc.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_type_status ON pay_svc.invoices (invoice_type, status);

CREATE TABLE IF NOT EXISTS pay_svc.tax_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES order_svc.bookings(id) ON DELETE SET NULL,
  caterer_id uuid REFERENCES caterer_svc.caterers(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('caterer', 'platform', 'customer', 'booking', 'settlement')),
  entity_id text NOT NULL,
  tax_type text NOT NULL CHECK (tax_type IN ('tds_194o', 'tcs_section_52', 'tcs_52', 'tcs_gst_sec52', 'gst_commission', 'gst_catering', 'gst_input', 'gst')),
  rate_basis_points integer NOT NULL CHECK (rate_basis_points >= 0),
  taxable_amount_paise integer NOT NULL CHECK (taxable_amount_paise >= 0),
  tax_amount_paise integer NOT NULL CHECK (tax_amount_paise >= 0),
  financial_year text NOT NULL,
  quarter text NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'deposited', 'filed', 'waived', 'remitted', 'reversed', 'recorded', 'reconciled')),
  challan_reference text,
  deposited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_ledger_entity ON pay_svc.tax_ledger (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_fy_qtr ON pay_svc.tax_ledger (financial_year, quarter);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_tax_type ON pay_svc.tax_ledger (tax_type);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_booking ON pay_svc.tax_ledger (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tax_ledger_caterer ON pay_svc.tax_ledger (caterer_id) WHERE caterer_id IS NOT NULL;

-- ============================================================================
-- 4. P1-8: Caterer Onboarding Granular Statuses & Correction Notes
-- ============================================================================

ALTER TABLE caterer_svc.caterers DROP CONSTRAINT IF EXISTS caterers_status_check;
ALTER TABLE caterer_svc.caterers ADD CONSTRAINT caterers_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'needs_correction'::text, 'under_review'::text, 'suspended'::text]));

ALTER TABLE caterer_svc.caterers ADD COLUMN IF NOT EXISTS correction_notes text;
CREATE INDEX IF NOT EXISTS idx_caterers_status ON caterer_svc.caterers (status);

-- ============================================================================
-- 5. P1-9: FSSAI & Private Documents with HMAC Signed URLs
-- ============================================================================

CREATE TABLE IF NOT EXISTS caterer_svc.caterer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  document_type text,
  file_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'needs_correction', 'expired', 'uploaded')),
  verification_notes text,
  expires_at timestamptz,
  signed_token text,
  signed_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotently ensure all columns exist if table was already created in Migration 01
ALTER TABLE caterer_svc.caterer_documents
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_token text,
  ADD COLUMN IF NOT EXISTS signed_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Drop legacy constraint if present
ALTER TABLE caterer_svc.caterer_documents DROP CONSTRAINT IF EXISTS caterer_documents_doc_type_check;

-- Ensure status check constraint covers all statuses
ALTER TABLE caterer_svc.caterer_documents DROP CONSTRAINT IF EXISTS caterer_documents_status_check;
ALTER TABLE caterer_svc.caterer_documents ADD CONSTRAINT caterer_documents_status_check
  CHECK (status IN ('pending', 'verified', 'rejected', 'needs_correction', 'expired', 'uploaded'));

-- Relax nullability on legacy 01 columns
ALTER TABLE caterer_svc.caterer_documents ALTER COLUMN doc_type DROP NOT NULL;
ALTER TABLE caterer_svc.caterer_documents ALTER COLUMN file_url DROP NOT NULL;

-- Backfill from legacy columns if present
UPDATE caterer_svc.caterer_documents SET document_type = doc_type WHERE document_type IS NULL AND doc_type IS NOT NULL;
UPDATE caterer_svc.caterer_documents SET file_path = file_url WHERE file_path IS NULL AND file_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_caterer_documents_caterer_id ON caterer_svc.caterer_documents (caterer_id);
CREATE INDEX IF NOT EXISTS idx_caterer_documents_type ON caterer_svc.caterer_documents (caterer_id, document_type);
CREATE INDEX IF NOT EXISTS idx_caterer_documents_status ON caterer_svc.caterer_documents (status);

-- ============================================================================
-- 6. P1-10: Late-Cancel Penalties & Rebooking Link
-- ============================================================================

CREATE TABLE IF NOT EXISTS pay_svc.caterer_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES order_svc.bookings(id) ON DELETE SET NULL,
  penalty_type text NOT NULL CHECK (penalty_type IN ('late_cancellation', 'no_show', 'service_shortage', 'quality_breach', 'quality_default', 'other')),
  penalty_amount_paise integer NOT NULL CHECK (penalty_amount_paise > 0),
  deducted_from_settlement_id uuid REFERENCES pay_svc.caterer_settlements(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pending_deduction', 'deducted', 'waived', 'disputed')),
  reason text NOT NULL,
  waived_by text,
  waived_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caterer_penalties_caterer ON pay_svc.caterer_penalties (caterer_id);
CREATE INDEX IF NOT EXISTS idx_caterer_penalties_booking ON pay_svc.caterer_penalties (booking_id);
CREATE INDEX IF NOT EXISTS idx_caterer_penalties_status ON pay_svc.caterer_penalties (status);

-- Add customer rebook linkage and penalty amount on bookings
ALTER TABLE order_svc.bookings
  ADD COLUMN IF NOT EXISTS rebooked_from_booking_id uuid REFERENCES order_svc.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caterer_penalty_paise integer DEFAULT 0 CHECK (caterer_penalty_paise >= 0);

CREATE INDEX IF NOT EXISTS idx_bookings_rebooked_from ON order_svc.bookings (rebooked_from_booking_id) WHERE rebooked_from_booking_id IS NOT NULL;

-- ============================================================================
-- 7. P1-11: Booking Reminders Sent (Idempotent Notification Hook)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notify_svc.reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES order_svc.bookings(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'web_push', 'email', 'all')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT reminders_sent_booking_type_unique UNIQUE (booking_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_reminders_sent_booking ON notify_svc.reminders_sent (booking_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_type ON notify_svc.reminders_sent (reminder_type);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_sent_at ON notify_svc.reminders_sent (sent_at);

-- ============================================================================
-- 8. P1-12: Customer Complaint & Dispute Ticketing Workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_svc.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES order_svc.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth_svc.users(id) ON DELETE CASCADE,
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('food_quality', 'tardiness', 'hygiene', 'service_shortage', 'other')),
  description text NOT NULL,
  evidence_urls text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'under_investigation', 'resolved', 'dismissed')),
  resolution text CHECK (resolution IS NULL OR resolution IN ('refund_customer', 'dismiss', 'split_adjustment', 'caterer_penalized', 'other')),
  resolution_notes text,
  refund_amount_paise integer NOT NULL DEFAULT 0 CHECK (refund_amount_paise >= 0),
  settlement_hold_id uuid REFERENCES pay_svc.caterer_settlements(id) ON DELETE SET NULL,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_booking_id ON order_svc.disputes (booking_id);
CREATE INDEX IF NOT EXISTS idx_disputes_customer_id ON order_svc.disputes (customer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_caterer_id ON order_svc.disputes (caterer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON order_svc.disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_category ON order_svc.disputes (category);
CREATE INDEX IF NOT EXISTS idx_disputes_settlement_hold ON order_svc.disputes (settlement_hold_id) WHERE settlement_hold_id IS NOT NULL;

-- ============================================================================
-- 9. P1-7: Split Payments & Tranche Type Constraints
-- ============================================================================

ALTER TABLE pay_svc.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE pay_svc.payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['full'::text, 'advance'::text, 'balance'::text, 'split'::text]));

ALTER TABLE order_svc.bookings DROP CONSTRAINT IF EXISTS bookings_payment_type_check;
ALTER TABLE order_svc.bookings ADD CONSTRAINT bookings_payment_type_check
  CHECK (payment_type IS NULL OR payment_type = ANY (ARRAY['full'::text, 'advance'::text, 'split'::text]));

