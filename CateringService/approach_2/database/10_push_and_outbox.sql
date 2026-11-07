-- 10_push_and_outbox.sql: Push Subscriptions & Transactional Outbox for CaterConnect

-- 1. Web Push Subscriptions Table
CREATE TABLE IF NOT EXISTS notify_svc.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_svc.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON notify_svc.push_subscriptions(user_id);

-- 2. Transactional Outbox Table for Asynchronous Notification Dispatching
CREATE TABLE IF NOT EXISTS notify_svc.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'booking_requested', 'booking_accepted', 'booking_rejected', 'booking_paid', 'booking_cancelled', 'booking_completed', 'chat_message'
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'processed', 'failed')) DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON notify_svc.notification_outbox(status, created_at) WHERE status = 'pending';

-- 3. Extend notify_svc.notification_logs to include web_push channel and all lifecycle event templates
ALTER TABLE notify_svc.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_channel_check;
ALTER TABLE notify_svc.notification_logs ADD CONSTRAINT notification_logs_channel_check 
  CHECK (channel IN ('whatsapp', 'sms', 'web_push'));

ALTER TABLE notify_svc.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_template_type_check;
ALTER TABLE notify_svc.notification_logs ADD CONSTRAINT notification_logs_template_type_check 
  CHECK (template_type IN (
    'booking_requested', 
    'booking_accepted', 
    'booking_rejected', 
    'booking_paid', 
    'payment_captured', 
    'booking_cancelled', 
    'booking_completed', 
    'chat_message'
  ));
