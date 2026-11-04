-- 03_availability_schema.sql: Live Availability and Blackout Dates for CaterConnect

CREATE TABLE IF NOT EXISTS caterer_svc.caterer_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id UUID NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  unavailable_date DATE NOT NULL,
  reason TEXT,
  auto_locked BOOLEAN DEFAULT FALSE,
  booking_id UUID REFERENCES order_svc.bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT caterer_date_unique UNIQUE (caterer_id, unavailable_date)
);

CREATE INDEX IF NOT EXISTS idx_caterer_avail_date ON caterer_svc.caterer_availability (caterer_id, unavailable_date);
