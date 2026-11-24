-- Migration 15: Launch Hardening - Webhook Events, Refresh Tokens, Admin Audit Logs & Balance Tracking

-- 1. Dedicated Webhook Events Table for Strict Idempotency & Error Tracing (P0-4, P1-5)
CREATE TABLE IF NOT EXISTS pay_svc.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed', 'ignored')),
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON pay_svc.webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON pay_svc.webhook_events(status);

-- 2. Refresh Tokens Table with Rotation & Reuse Detection (P0-24)
CREATE TABLE IF NOT EXISTS auth_svc.refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_svc.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON auth_svc.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON auth_svc.refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON auth_svc.refresh_tokens(family_id);

-- 3. Centralized Admin Actions Audit Logging (P0-27)
CREATE SCHEMA IF NOT EXISTS audit_svc;

CREATE TABLE IF NOT EXISTS audit_svc.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON audit_svc.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON audit_svc.admin_audit_logs(entity_type, entity_id);

-- 4. Balance Due & Payment Tracking Columns for Bookings (P0-8)
ALTER TABLE order_svc.bookings
  ADD COLUMN IF NOT EXISTS balance_due_date timestamptz,
  ADD COLUMN IF NOT EXISTS advance_paid_at timestamptz;

-- 5. Expand Payment Type Check to Support Balance Settlements (P0-8)
ALTER TABLE pay_svc.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE pay_svc.payments ADD CONSTRAINT payments_payment_type_check CHECK (payment_type = ANY (ARRAY['full'::text, 'advance'::text, 'balance'::text]));

