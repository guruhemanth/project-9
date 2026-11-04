-- 04_settlement_schema.sql: Caterer Payouts & Settlement Ledger for CaterConnect

CREATE TABLE IF NOT EXISTS pay_svc.caterer_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES order_svc.bookings(id) ON DELETE CASCADE,
  caterer_id UUID NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  gross_amount_paise INTEGER NOT NULL CHECK (gross_amount_paise >= 0),
  commission_pct NUMERIC(4,2) NOT NULL DEFAULT 15.00,
  commission_amount_paise INTEGER NOT NULL CHECK (commission_amount_paise >= 0),
  net_payout_paise INTEGER NOT NULL CHECK (net_payout_paise >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'settled', 'held')) DEFAULT 'pending',
  utr_reference TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlement_booking_unique UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_caterer_settlements_caterer ON pay_svc.caterer_settlements (caterer_id);
CREATE INDEX IF NOT EXISTS idx_caterer_settlements_status ON pay_svc.caterer_settlements (status);
