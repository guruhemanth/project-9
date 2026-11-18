-- Migration 14: Instant Booking and Dual-Mode Payment Synchronization
-- Adds instant booking toggle to caterers and payment deadlines / refund tracking to bookings

-- 1. Add instant_booking_enabled toggle to caterer_svc.caterers
ALTER TABLE caterer_svc.caterers
ADD COLUMN IF NOT EXISTS instant_booking_enabled boolean NOT NULL DEFAULT false;

-- 2. Add booking_mode, payment_deadline, and refund tracking to order_svc.bookings
ALTER TABLE order_svc.bookings
ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'on_request',
ADD COLUMN IF NOT EXISTS payment_deadline timestamptz,
ADD COLUMN IF NOT EXISTS refund_id text,
ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- 3. Update check constraint on order_svc.bookings status to permit 'expired' and 'rejected'
ALTER TABLE order_svc.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE order_svc.bookings ADD CONSTRAINT bookings_status_check 
CHECK (status = ANY (ARRAY['requested'::text, 'accepted'::text, 'rejected'::text, 'paid'::text, 'completed'::text, 'cancelled'::text, 'expired'::text]));

-- 4. Index for efficient expiry sweeps on active accepted bookings
CREATE INDEX IF NOT EXISTS idx_bookings_deadline 
ON order_svc.bookings (payment_deadline) 
WHERE status = 'accepted' AND payment_deadline IS NOT NULL;
