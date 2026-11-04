-- 20261103000002_dual_payment_options.sql
-- Migration adding dual payment options: Full payment or Advance percentage to lock the deal

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_type text CHECK (payment_type IN ('full', 'advance')) DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS advance_pct numeric(4,2) DEFAULT 25.00 CHECK (advance_pct > 0 AND advance_pct <= 100),
  ADD COLUMN IF NOT EXISTS amount_paid integer DEFAULT 0 CHECK (amount_paid >= 0),
  ADD COLUMN IF NOT EXISTS balance_due integer DEFAULT 0 CHECK (balance_due >= 0);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_type text CHECK (payment_type IN ('full', 'advance')) DEFAULT 'full';

-- RPC: mark_booking_paid_by_webhook (Security definer, invoked on verified webhook)
CREATE OR REPLACE FUNCTION public.mark_booking_paid_by_webhook(
  p_booking_id uuid,
  p_order_id text,
  p_payment_id text,
  p_amount_paid integer,
  p_payment_type text,
  p_raw_event jsonb
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_balance integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Idempotency check: if already paid, return existing row
  IF v_booking.status = 'paid' THEN
    RETURN v_booking;
  END IF;

  IF v_booking.status <> 'accepted' THEN
    RAISE EXCEPTION 'Cannot mark booking paid from % status', v_booking.status;
  END IF;

  v_balance := GREATEST(0, COALESCE(v_booking.total_amount, 0) - p_amount_paid);

  -- Update payments table
  INSERT INTO public.payments (
    booking_id,
    razorpay_order_id,
    razorpay_payment_id,
    amount,
    currency,
    status,
    payment_type,
    raw_event
  ) VALUES (
    p_booking_id,
    p_order_id,
    p_payment_id,
    p_amount_paid,
    'INR',
    'captured',
    p_payment_type,
    p_raw_event
  )
  ON CONFLICT (razorpay_order_id) DO UPDATE
  SET
    razorpay_payment_id = EXCLUDED.razorpay_payment_id,
    status = 'captured',
    raw_event = EXCLUDED.raw_event,
    updated_at = now();

  -- Update booking
  UPDATE public.bookings
  SET
    status = 'paid',
    payment_type = p_payment_type,
    amount_paid = p_amount_paid,
    balance_due = v_balance,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- Insert status history row
  INSERT INTO public.booking_status_history (
    booking_id,
    from_status,
    to_status,
    changed_by,
    note
  ) VALUES (
    p_booking_id,
    'accepted',
    'paid',
    NULL,
    CASE
      WHEN p_payment_type = 'advance' THEN 'Deal locked with ' || v_booking.advance_pct || '% advance payment'
      ELSE 'Full payment captured'
    END
  );

  RETURN v_booking;
END;
$$;
