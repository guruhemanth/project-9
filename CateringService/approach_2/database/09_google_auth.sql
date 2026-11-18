-- Migration 09: Google OAuth Support
ALTER TABLE auth_svc.users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE auth_svc.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE auth_svc.users ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE auth_svc.users ADD COLUMN IF NOT EXISTS google_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON auth_svc.users(google_id) WHERE google_id IS NOT NULL;
