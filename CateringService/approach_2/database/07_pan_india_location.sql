-- Migration 07: Pan-India multi-state and multi-city location support

-- 1. Add state, pincode, and address to caterers
ALTER TABLE caterer_svc.caterers 
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'Andhra Pradesh',
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS address text;

-- 2. Add state and pincode to bookings
ALTER TABLE order_svc.bookings
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'Andhra Pradesh',
  ADD COLUMN IF NOT EXISTS pincode text;

-- 3. Create indexes for fast location-based search and filtering
CREATE INDEX IF NOT EXISTS idx_caterers_city_state ON caterer_svc.caterers (LOWER(city), LOWER(state)) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_bookings_city_state ON order_svc.bookings (LOWER(city), LOWER(state));
