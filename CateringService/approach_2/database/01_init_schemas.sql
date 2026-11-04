-- Database Service Schemas & Initial Migrations for Approach 2

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create isolated schemas
CREATE SCHEMA IF NOT EXISTS auth_svc;
CREATE SCHEMA IF NOT EXISTS caterer_svc;
CREATE SCHEMA IF NOT EXISTS order_svc;
CREATE SCHEMA IF NOT EXISTS pay_svc;
CREATE SCHEMA IF NOT EXISTS review_svc;

-- 2. AUTH SERVICE SCHEMA
CREATE TABLE IF NOT EXISTS auth_svc.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'caterer', 'admin')),
  full_name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_svc.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_svc.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. CATERER & MENU SERVICE SCHEMA
CREATE TABLE IF NOT EXISTS caterer_svc.caterers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  business_name text NOT NULL,
  description text,
  city text NOT NULL DEFAULT 'Tirupati',
  service_areas text[] NOT NULL DEFAULT '{}'::text[],
  cuisines text[] NOT NULL DEFAULT '{}'::text[],
  fssai_number text NOT NULL,
  gst_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  rejection_reason text,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0.00,
  review_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caterer_svc.caterer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('fssai_certificate', 'id_proof', 'photo')),
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caterer_svc.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_per_plate_paise integer NOT NULL CHECK (price_per_plate_paise > 0),
  min_guests integer NOT NULL DEFAULT 10 CHECK (min_guests > 0),
  max_guests integer,
  is_veg boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caterer_svc.package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES caterer_svc.packages(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('starter', 'main', 'dessert', 'beverage'))
);

CREATE TABLE IF NOT EXISTS caterer_svc.addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  pricing_unit text NOT NULL CHECK (pricing_unit IN ('flat', 'per_plate'))
);

-- 4. ORDER & BOOKING SERVICE SCHEMA
CREATE TABLE IF NOT EXISTS order_svc.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  caterer_id uuid NOT NULL,
  package_id uuid NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  guest_count integer NOT NULL CHECK (guest_count > 0),
  venue_address text NOT NULL,
  city text NOT NULL DEFAULT 'Tirupati',
  special_requests text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'rejected', 'paid', 'completed', 'cancelled', 'expired')),
  total_amount_paise integer CHECK (total_amount_paise IS NULL OR total_amount_paise >= 0),
  commission_pct numeric(4,2) DEFAULT 15.00,
  commission_amount_paise integer DEFAULT 0,
  payment_type text CHECK (payment_type IN ('full', 'advance')),
  advance_pct numeric(4,2) DEFAULT 25.00,
  amount_paid_paise integer DEFAULT 0,
  balance_due_paise integer DEFAULT 0,
  caterer_note text,
  cancelled_by text,
  cancel_reason text,
  refund_amount_paise integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_svc.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES order_svc.bookings(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. PAYMENT SERVICE SCHEMA
CREATE TABLE IF NOT EXISTS pay_svc.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  razorpay_order_id text UNIQUE NOT NULL,
  razorpay_payment_id text UNIQUE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'captured', 'failed', 'refunded', 'partially_refunded')),
  payment_type text NOT NULL CHECK (payment_type IN ('full', 'advance')),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pay_svc.platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_pct numeric(4,2) NOT NULL DEFAULT 15.00,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pay_svc.platform_settings (id, commission_pct) VALUES (1, 15.00)
ON CONFLICT (id) DO NOTHING;

-- 6. REVIEW SERVICE SCHEMA
CREATE TABLE IF NOT EXISTS review_svc.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid UNIQUE NOT NULL,
  customer_id uuid NOT NULL,
  caterer_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
