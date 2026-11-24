-- Migration 17: Performance Indexes for Latency Optimization
-- Target Tables: order_svc.bookings, caterer_svc.packages, caterer_svc.package_items, caterer_svc.caterers, pay_svc.payments

-- 1. Bookings composite indexes for fast customer and caterer queue retrievals
CREATE INDEX IF NOT EXISTS idx_bookings_caterer_status_date 
  ON order_svc.bookings (caterer_id, status, event_date ASC);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_created 
  ON order_svc.bookings (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_status_date 
  ON order_svc.bookings (status, event_date);

-- 2. Packages & Package Items foreign key indexes to eliminate full scans during catalog joins
CREATE INDEX IF NOT EXISTS idx_packages_caterer_id 
  ON caterer_svc.packages (caterer_id);

CREATE INDEX IF NOT EXISTS idx_package_items_package_id 
  ON caterer_svc.package_items (package_id);

-- 3. GIN index for fast array containment and search on caterer service areas
CREATE INDEX IF NOT EXISTS idx_caterers_service_areas 
  ON caterer_svc.caterers USING GIN (service_areas);

-- 4. Payment foreign key index for instantaneous booking payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_booking_id 
  ON pay_svc.payments (booking_id);
