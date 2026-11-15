-- 13_caterer_bank_details_schema.sql
-- Add caterer payout bank account details for settlements and disbursement

ALTER TABLE caterer_svc.caterers
ADD COLUMN IF NOT EXISTS bank_account_holder_name text,
ADD COLUMN IF NOT EXISTS bank_account_number text,
ADD COLUMN IF NOT EXISTS bank_ifsc text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS upi_id text,
ADD COLUMN IF NOT EXISTS bank_cheque_url text,
ADD COLUMN IF NOT EXISTS bank_verified boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bank_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_caterers_bank_ifsc ON caterer_svc.caterers (bank_ifsc) WHERE bank_ifsc IS NOT NULL;
