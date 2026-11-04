-- 06_chat_schema.sql: Real-Time In-App Messaging for CaterConnect

CREATE SCHEMA IF NOT EXISTS chat_svc;

CREATE TABLE IF NOT EXISTS chat_svc.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES order_svc.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth_svc.users(id) ON DELETE CASCADE,
  caterer_id UUID NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT thread_booking_unique UNIQUE (booking_id)
);

CREATE TABLE IF NOT EXISTS chat_svc.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_svc.chat_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth_svc.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'caterer', 'admin')),
  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_svc.chat_messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_booking ON chat_svc.chat_threads (booking_id);
