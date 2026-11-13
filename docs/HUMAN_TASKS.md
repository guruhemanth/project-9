# CaterConnect - Human Tasks & Credential Rotation Log

This document tracks all manual developer/operations tasks that cannot be performed autonomously by the agent (such as account creation, external credential provisioning, and secret rotation for previously committed values).

---

## 1. Credentials to Rotate (Committed in Historical Git Commits)

The following secret-like or test credential values were detected in historical git commits prior to repository hardening. **If any of these values correspond to active external accounts, rotate them immediately.**

| Item | Value / Pattern Identified | Historical Location | Status / Action Needed |
| :--- | :--- | :--- | :--- |
| **Supabase Demo JWT** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24i...` | `CateringService/.env`, `CateringService/approach_1/.env` (commits `df040102`, `31d5a3dd`) | Untracked from git index in Milestone 1. Local Supabase anon key; rotate if used in shared environments. |
| **PostgreSQL Dev Password** | `postgrespassword` | `CateringService/approach_2/docker-compose.yml` (commit `6be88a03`) | Replaced with `${POSTGRES_PASSWORD:?}`. Ensure production database uses a cryptographically random password. |
| **JWT Dev Secret** | `super-secret-jwt-token-with-at-least-32-characters-long` | `backend/gateway`, `backend/services/auth`, `scripts/start-all.sh` | Removed hardcoded string. Generate a fresh 64-character hex string for production `JWT_SECRET`. |
| **Razorpay Test Placeholders** | `rzp_test_placeholder_key`, `rzp_test_placeholder_secret`, `caterconnect_test_webhook_secret_key` | `docker-compose.yml`, `scripts/start-all.sh` | Replaced with `${RAZORPAY_*:?}`. Obtain live credentials from Razorpay dashboard. |

---

## 2. External Provider Accounts & Credentials (Required Before Production)

The following manual setup steps must be performed by human operators:

### A. Google Cloud Console (Google Identity Services for Customer Sign-in)
- [ ] Create a project in [Google Cloud Console](https://console.cloud.google.com/).
- [ ] Configure the OAuth Consent Screen (Application name: *CaterConnect*).
- [ ] Create an OAuth 2.0 Web Client ID:
  - Authorized JavaScript Origins: `http://localhost:5173`, `http://localhost:3000`, `https://caterconnect.in`
  - Authorized Redirect URIs: `https://caterconnect.in/api/auth/google/callback`
- [ ] Add `GOOGLE_CLIENT_ID` to `.env` on backend and `VITE_GOOGLE_CLIENT_ID` to customer frontend `.env`.

### B. Razorpay Dashboard (Payments & Webhooks)
- [ ] Complete KYC verification on [Razorpay Dashboard](https://dashboard.razorpay.com/).
- [ ] Generate Live API Key ID and Secret Key (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- [ ] Configure Webhook URL: `https://api.caterconnect.in/api/payments/webhook`.
  - Active events: `order.paid`, `payment.captured`.
  - Set a secret token and set `RAZORPAY_WEBHOOK_SECRET` in production `.env`.
- [ ] *Note on Automated Refunds & Payouts:* As per specification, automated payouts and automated refunds are disabled for launch. Disbursals and refunds must be processed manually via the Razorpay dashboard or bank portal and recorded with UTR references.

### C. Web Push (VAPID Keys)
- [ ] Generate VAPID key pair:
  ```bash
  npx web-push generate-vapid-keys
  ```
- [ ] Store `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `backend/services/notification/.env`.
- [ ] Store `VITE_VAPID_PUBLIC_KEY` in frontend `.env` files.

### D. SMS & WhatsApp Cloud API (Optional Live Notification Modes)
- [ ] Meta Developer Portal: Setup WhatsApp Cloud API phone number and obtain System User Access Token.
- [ ] Fast2SMS / MSG91: Obtain transactional SMS API Key and registered DLT Template IDs.
