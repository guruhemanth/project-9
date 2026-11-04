-- 20261103000000_init_schema.sql
-- Initial CaterConnect Schema & RLS

-- 1. ENUMS
CREATE TYPE user_role AS ENUM ('customer', 'caterer', 'admin');
CREATE TYPE caterer_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE booking_status AS ENUM ('requested', 'accepted', 'rejected', 'paid', 'completed', 'cancelled', 'expired');
CREATE TYPE payment_status AS ENUM ('created', 'captured', 'failed', 'refunded', 'partially_refunded');

-- 2. TABLES

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'customer',
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2.1 HELPER FUNCTIONS FOR SECURITY & ROLES
-- Helper to get profile role of authenticated user
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Helper to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.current_role() = 'admin', false);
$$;

-- 3. OTHER TABLES

-- CATERERS
CREATE TABLE public.caterers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  business_name text NOT NULL,
  description text,
  city text NOT NULL,
  service_areas text[] DEFAULT '{}'::text[],
  cuisines text[] DEFAULT '{}'::text[],
  fssai_number text NOT NULL,
  gst_number text,
  status caterer_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0.00,
  review_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CATERER DOCUMENTS
CREATE TABLE public.caterer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES public.caterers(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('fssai_certificate', 'id_proof', 'photo')),
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PACKAGES
CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES public.caterers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_per_plate integer NOT NULL CHECK (price_per_plate > 0),
  min_guests integer NOT NULL DEFAULT 10 CHECK (min_guests > 0),
  max_guests integer CHECK (max_guests IS NULL OR max_guests >= min_guests),
  is_veg boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PACKAGE ITEMS
CREATE TABLE public.package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('starter', 'main', 'dessert', 'beverage'))
);

-- ADDONS
CREATE TABLE public.addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES public.caterers(id) ON DELETE CASCADE,
  name text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  pricing_unit text NOT NULL CHECK (pricing_unit IN ('flat', 'per_plate'))
);

-- PLATFORM SETTINGS
CREATE TABLE public.platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_pct numeric(4,2) NOT NULL DEFAULT 15.00 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id, commission_pct) VALUES (1, 15.00)
ON CONFLICT (id) DO NOTHING;

-- BOOKINGS
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  caterer_id uuid NOT NULL REFERENCES public.caterers(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  event_date date NOT NULL,
  event_time time NOT NULL,
  guest_count integer NOT NULL CHECK (guest_count > 0),
  venue_address text NOT NULL,
  city text NOT NULL,
  special_requests text,
  status booking_status NOT NULL DEFAULT 'requested',
  total_amount integer CHECK (total_amount IS NULL OR total_amount >= 0),
  commission_pct numeric(4,2) CHECK (commission_pct IS NULL OR (commission_pct >= 0 AND commission_pct <= 100)),
  commission_amount integer CHECK (commission_amount IS NULL OR commission_amount >= 0),
  caterer_note text,
  cancelled_by user_role,
  cancel_reason text,
  refund_amount integer DEFAULT 0 CHECK (refund_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- BOOKING ADDONS
CREATE TABLE public.booking_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES public.addons(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_at_booking integer NOT NULL CHECK (price_at_booking >= 0)
);

-- BOOKING STATUS HISTORY (Insert-only audit)
CREATE TABLE public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status booking_status,
  to_status booking_status NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PAYMENTS
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  razorpay_order_id text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'INR',
  status payment_status NOT NULL DEFAULT 'created',
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- REVIEWS
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  caterer_id uuid NOT NULL REFERENCES public.caterers(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. INDEXES
CREATE INDEX idx_caterers_city_status ON public.caterers (city, status);
CREATE INDEX idx_caterers_cuisines ON public.caterers USING GIN (cuisines);
CREATE INDEX idx_packages_caterer_active ON public.packages (caterer_id, is_active);
CREATE INDEX idx_bookings_customer ON public.bookings (customer_id);
CREATE INDEX idx_bookings_caterer_status ON public.bookings (caterer_id, status);
CREATE INDEX idx_bookings_event_date ON public.bookings (event_date);
CREATE INDEX idx_payments_booking_id ON public.payments (booking_id);
CREATE INDEX idx_history_booking_id ON public.booking_status_history (booking_id);

-- 5. ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caterers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caterer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 5.1 PROFILES POLICIES
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (
    (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
    OR public.is_admin()
  );

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'customer');

-- 5.2 CATERERS POLICIES
CREATE POLICY "caterers_select_public_approved" ON public.caterers
  FOR SELECT TO anon, authenticated
  USING (status = 'approved');

CREATE POLICY "caterers_select_owner_or_admin" ON public.caterers
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "caterers_insert_caterer" ON public.caterers
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND status = 'pending');

CREATE POLICY "caterers_update_owner" ON public.caterers
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      owner_id = auth.uid()
      AND status = (SELECT c.status FROM public.caterers c WHERE c.id = caterers.id)
      AND avg_rating = (SELECT c.avg_rating FROM public.caterers c WHERE c.id = caterers.id)
      AND review_count = (SELECT c.review_count FROM public.caterers c WHERE c.id = caterers.id)
    )
  );

-- 5.3 CATERER DOCUMENTS POLICIES
CREATE POLICY "caterer_docs_owner_admin_select" ON public.caterer_documents
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
  );

CREATE POLICY "caterer_docs_owner_insert" ON public.caterer_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
  );

CREATE POLICY "caterer_docs_owner_delete" ON public.caterer_documents
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
  );

-- 5.4 PACKAGES, ITEMS & ADDONS POLICIES
CREATE POLICY "packages_select_public" ON public.packages
  FOR SELECT TO anon, authenticated
  USING (
    (is_active = true AND caterer_id IN (SELECT id FROM public.caterers WHERE status = 'approved'))
    OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "packages_caterer_cud" ON public.packages
  FOR ALL TO authenticated
  USING (
    caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "package_items_select" ON public.package_items
  FOR SELECT TO anon, authenticated
  USING (
    package_id IN (SELECT id FROM public.packages WHERE
      (is_active = true AND caterer_id IN (SELECT id FROM public.caterers WHERE status = 'approved'))
      OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
      OR public.is_admin()
    )
  );

CREATE POLICY "package_items_caterer_cud" ON public.package_items
  FOR ALL TO authenticated
  USING (
    package_id IN (SELECT id FROM public.packages WHERE
      caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
      OR public.is_admin()
    )
  );

CREATE POLICY "addons_select_public" ON public.addons
  FOR SELECT TO anon, authenticated
  USING (
    caterer_id IN (SELECT id FROM public.caterers WHERE status = 'approved')
    OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "addons_caterer_cud" ON public.addons
  FOR ALL TO authenticated
  USING (
    caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

-- 5.5 PLATFORM SETTINGS POLICIES
CREATE POLICY "platform_settings_admin_only" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5.6 BOOKINGS POLICIES
-- Customer can insert new booking with status 'requested'
CREATE POLICY "bookings_insert_customer" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND status = 'requested'
  );

-- Customer, Caterer, Admin can view relevant bookings
CREATE POLICY "bookings_select_participants_or_admin" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

-- Direct update is blocked for clients (must use RPCs)
CREATE POLICY "bookings_update_admin_only" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5.7 BOOKING ADDONS & STATUS HISTORY POLICIES
CREATE POLICY "booking_addons_select" ON public.booking_addons
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM public.bookings WHERE
        customer_id = auth.uid()
        OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
        OR public.is_admin()
    )
  );

CREATE POLICY "booking_addons_insert" ON public.booking_addons
  FOR INSERT TO authenticated
  WITH CHECK (
    booking_id IN (
      SELECT id FROM public.bookings WHERE customer_id = auth.uid() AND status = 'requested'
    )
  );

CREATE POLICY "booking_history_select" ON public.booking_status_history
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM public.bookings WHERE
        customer_id = auth.uid()
        OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
        OR public.is_admin()
    )
  );

-- 5.8 PAYMENTS POLICIES
CREATE POLICY "payments_select_participants" ON public.payments
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM public.bookings WHERE
        customer_id = auth.uid()
        OR caterer_id IN (SELECT id FROM public.caterers WHERE owner_id = auth.uid())
        OR public.is_admin()
    )
  );

-- 5.9 REVIEWS POLICIES
CREATE POLICY "reviews_select_all" ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "reviews_insert_customer" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND booking_id IN (
      SELECT id FROM public.bookings WHERE
        id = reviews.booking_id
        AND customer_id = auth.uid()
        AND status = 'completed'
    )
  );

CREATE POLICY "reviews_admin_delete" ON public.reviews
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 6. TRIGGERS & RPC FUNCTIONS

-- Trigger: Review stats calculation on Caterers
CREATE OR REPLACE FUNCTION public.sync_caterer_review_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.caterers
  SET
    avg_rating = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM public.reviews WHERE caterer_id = NEW.caterer_id), 0.00),
    review_count = (SELECT count(*) FROM public.reviews WHERE caterer_id = NEW.caterer_id)
  WHERE id = NEW.caterer_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_review_stats
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.sync_caterer_review_stats();

-- Trigger: Insert status history row on booking insert
CREATE OR REPLACE FUNCTION public.on_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  VALUES (NEW.id, NULL, NEW.status, auth.uid(), 'Initial booking request');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_created
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.on_booking_created();

-- 7. BOOKING STATE MACHINE RPCs

-- Accept Booking (Caterer only)
CREATE OR REPLACE FUNCTION public.accept_booking(p_booking_id uuid, p_note text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_pkg public.packages;
  v_caterer public.caterers;
  v_comm_pct numeric(4,2);
  v_addon_sum integer := 0;
  v_calc_total integer;
  v_calc_comm integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO v_caterer FROM public.caterers WHERE id = v_booking.caterer_id;
  IF v_caterer.owner_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only assigned caterer can accept booking';
  END IF;

  IF v_booking.status <> 'requested' THEN
    RAISE EXCEPTION 'Cannot accept booking in % status', v_booking.status;
  END IF;

  SELECT * INTO v_pkg FROM public.packages WHERE id = v_booking.package_id;
  SELECT commission_pct INTO v_comm_pct FROM public.platform_settings WHERE id = 1;
  IF v_comm_pct IS NULL THEN
    v_comm_pct := 15.00;
  END IF;

  SELECT coalesce(sum(quantity * price_at_booking), 0) INTO v_addon_sum
  FROM public.booking_addons WHERE booking_id = p_booking_id;

  v_calc_total := (v_booking.guest_count * v_pkg.price_per_plate) + v_addon_sum;
  v_calc_comm := round((v_calc_total * v_comm_pct) / 100);

  UPDATE public.bookings
  SET
    status = 'accepted',
    total_amount = v_calc_total,
    commission_pct = v_comm_pct,
    commission_amount = v_calc_comm,
    caterer_note = p_note,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  VALUES (p_booking_id, 'requested', 'accepted', auth.uid(), p_note);

  RETURN v_booking;
END;
$$;

-- Reject Booking (Caterer only)
CREATE OR REPLACE FUNCTION public.reject_booking(p_booking_id uuid, p_note text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_caterer public.caterers;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO v_caterer FROM public.caterers WHERE id = v_booking.caterer_id;
  IF v_caterer.owner_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only assigned caterer can reject booking';
  END IF;

  IF v_booking.status <> 'requested' THEN
    RAISE EXCEPTION 'Cannot reject booking in % status', v_booking.status;
  END IF;

  UPDATE public.bookings
  SET
    status = 'rejected',
    caterer_note = p_note,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  VALUES (p_booking_id, 'requested', 'rejected', auth.uid(), p_note);

  RETURN v_booking;
END;
$$;

-- Cancel Booking (Customer or Caterer)
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_caterer public.caterers;
  v_actor_role user_role;
  v_refund integer := 0;
  v_days_left integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO v_caterer FROM public.caterers WHERE id = v_booking.caterer_id;

  IF auth.uid() = v_booking.customer_id THEN
    v_actor_role := 'customer';
  ELSIF auth.uid() = v_caterer.owner_id THEN
    v_actor_role := 'caterer';
  ELSIF public.is_admin() THEN
    v_actor_role := 'admin';
  ELSE
    RAISE EXCEPTION 'Unauthorized to cancel this booking';
  END IF;

  IF v_booking.status NOT IN ('requested', 'accepted', 'paid') THEN
    RAISE EXCEPTION 'Cannot cancel booking in % status', v_booking.status;
  END IF;

  -- Refund calculation if booking was paid
  IF v_booking.status = 'paid' THEN
    v_days_left := v_booking.event_date - current_date;
    IF v_actor_role = 'caterer' OR v_actor_role = 'admin' THEN
      v_refund := coalesce(v_booking.total_amount, 0);
    ELSIF v_actor_role = 'customer' THEN
      IF v_days_left >= 7 THEN
        v_refund := coalesce(v_booking.total_amount, 0); -- 100%
      ELSIF v_days_left >= 3 THEN
        v_refund := round(coalesce(v_booking.total_amount, 0) * 0.50); -- 50%
      ELSE
        v_refund := 0; -- 0% under 3 days
      END IF;
    END IF;
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by = v_actor_role,
    cancel_reason = p_reason,
    refund_amount = v_refund,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  VALUES (p_booking_id, v_booking.status, 'cancelled', auth.uid(), p_reason);

  RETURN v_booking;
END;
$$;

-- Complete Booking (Caterer only, on or after event date)
CREATE OR REPLACE FUNCTION public.complete_booking(p_booking_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_caterer public.caterers;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO v_caterer FROM public.caterers WHERE id = v_booking.caterer_id;
  IF v_caterer.owner_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only caterer can mark booking completed';
  END IF;

  IF v_booking.status <> 'paid' THEN
    RAISE EXCEPTION 'Cannot complete booking that is not paid (current status: %)', v_booking.status;
  END IF;

  IF current_date < v_booking.event_date THEN
    RAISE EXCEPTION 'Cannot complete booking prior to the event date';
  END IF;

  UPDATE public.bookings
  SET
    status = 'completed',
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  VALUES (p_booking_id, 'paid', 'completed', auth.uid(), 'Event marked completed');

  RETURN v_booking;
END;
$$;

-- Expire Stale Bookings (Scheduled function)
CREATE OR REPLACE FUNCTION public.expire_stale_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_rec record;
BEGIN
  -- Requested older than 48 hours without caterer response
  FOR v_rec IN
    SELECT id, status FROM public.bookings
    WHERE status = 'requested' AND created_at < now() - interval '48 hours'
  LOOP
    UPDATE public.bookings SET status = 'expired', updated_at = now() WHERE id = v_rec.id;
    INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
    VALUES (v_rec.id, 'requested', 'expired', NULL, 'Auto-expired after 48h with no response');
    v_count := v_count + 1;
  END LOOP;

  -- Accepted unpaid after 24 hours
  FOR v_rec IN
    SELECT id, status FROM public.bookings
    WHERE status = 'accepted' AND updated_at < now() - interval '24 hours'
  LOOP
    UPDATE public.bookings SET status = 'expired', updated_at = now() WHERE id = v_rec.id;
    INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
    VALUES (v_rec.id, 'accepted', 'expired', NULL, 'Auto-expired after 24h unpaid');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
