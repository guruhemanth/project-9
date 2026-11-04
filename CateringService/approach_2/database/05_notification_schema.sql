-- 05_notification_schema.sql: Transactional Notifications for CaterConnect

CREATE SCHEMA IF NOT EXISTS notify_svc;

CREATE TABLE IF NOT EXISTS notify_svc.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('customer', 'caterer', 'admin')),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  template_type TEXT NOT NULL CHECK (template_type IN ('booking_requested', 'booking_accepted', 'payment_captured', 'booking_cancelled')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')) DEFAULT 'queued',
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notify_booking ON notify_svc.notification_logs (booking_id);
