# CaterConnect External Integrations & Services

## Overview
CaterConnect interfaces with third-party payment gateways, identity providers, notification channels, container registries, and continuous deployment runners to deliver a secure, production-ready catering marketplace in India.

---

## 1. Payment Gateway: Razorpay
- **Integration**: Razorpay Node.js SDK (`razorpay` v2.9.4) & REST APIs.
- **Scope**: Exclusive payment rails for INR transactions across India supporting UPI, debit/credit cards, and net banking.
- **Dual Payment Flow**:
  - **Option 1 (100% Full Payment)**: Host pays the entire booking balance upfront.
  - **Option 2 (25% Advance Deal Lock)**: Host pays a 25% deposit to lock the caterer's calendar; the remaining 75% balance order is paid prior to the event.
- **Webhook Endpoint**: Handled strictly via API Gateway proxy to Payment Service (`/api/payments/webhook`).
  - **Verification**: Cryptographic HMAC-SHA256 signature verification against `RAZORPAY_WEBHOOK_SECRET`.
  - **Idempotency**: Webhook events logged in `pay_svc.webhook_events` with strict deduplication and dead-letter queue handling.
  - **Security Rule**: Payment state transitions (`accepted` -> `paid`) are authoritative *only* upon verified webhook event receipt (browser payment callback is never trusted as truth).
- **Commission & Escrow**:
  - 15% platform commission permanently snapshotted at booking creation.
  - Settlement ledger in `pay_svc.payouts` tracking caterer net payouts and bank UTR numbers.

---

## 2. Identity & Authentication: Google OAuth (Google Identity Services)
- **Integration**: Google Identity Services (GIS) Web SDK client-side and `google-auth-library` (v11.3.3) backend.
- **Endpoint**: `/api/auth/google` on Auth Service via Gateway proxy.
- **Flow**:
  - Customer triggers Google Sign-In button / modal.
  - Frontend receives ID token credential and submits to `/api/auth/google`.
  - Backend verifies cryptographic token integrity against `GOOGLE_CLIENT_ID`.
  - Automatically provisions or links customer accounts with verified email in `auth_svc.users` and `auth_svc.google_auth_links`.
  - Issues 15-minute access JWT and rotatable refresh tokens.

---

## 3. Communication & Notification Services
- **WhatsApp Direct Connect**:
  - Transactional deep-links via URI scheme (`https://wa.me/<phone>?text=...`) for instant event coordination between customer hosts and caterers.
- **SMS & Alerts Outbox**:
  - `notify_svc.outbox` queues transactional SMS and booking updates for event confirmations, cancellations, and reminder alerts.
- **Web Push Notifications**:
  - VAPID keypair generation and subscription storage in `notify_svc.push_subscriptions` for desktop/mobile browser push updates.
- **Real-Time WebSocket Chat**:
  - Built-in `@fastify/websocket` service (`chat-service`, port 4006) providing live two-way customer-to-caterer messaging per booking thread.

---

## 4. Database & Storage Architecture: PostgreSQL 15/16
- **Database Topology**: Dedicated multi-schema PostgreSQL instance partitioned into 6 domain schemas:
  1. `auth_svc`: User credentials, roles, refresh tokens, Google OAuth mappings, profiles.
  2. `caterer_svc`: Approved caterer businesses, 14-digit FSSAI records, menu items, banquet packages, blackout dates, commission settings.
  3. `order_svc`: Booking requests, guest counts, event dates, state machine status audit trail.
  4. `pay_svc`: Razorpay order records, transactions, webhook event idempotency ledger, settlements.
  5. `notify_svc`: Notification outbox queue, web push subscriptions, delivery tracking.
  6. `chat_svc`: Inquiry conversation threads, participants, real-time message history.
- **Data Integrity & Privacy**:
  - Strict integer paise arithmetic for all monetary values (`amount_paise`), zero floating-point arithmetic.
  - Automatic PII redaction (passwords, JWTs, phone numbers, emails) in structured Pino application logs.
  - Customer contact details masked until deposit payment is verified.

---

## 5. Container Registry & Infrastructure: Docker Hub & Oracle Cloud
- **Docker Hub Registry**: Prebuilt images published under `guruhemanth/*`:
  - `guruhemanth/caterconnect-auth-service:latest`
  - `guruhemanth/caterconnect-caterer-menu-service:latest`
  - `guruhemanth/caterconnect-booking-order-service:latest`
  - `guruhemanth/caterconnect-payment-service:latest`
  - `guruhemanth/caterconnect-notification-service:latest`
  - `guruhemanth/caterconnect-chat-service:latest`
  - `guruhemanth/caterconnect-api-gateway:latest`
  - `guruhemanth/caterconnect-customer-app:latest`
  - `guruhemanth/caterconnect-partner-app:latest`
  - `guruhemanth/caterconnect-admin-app:latest`
- **Host Infrastructure**: Oracle Cloud Infrastructure (OCI) compute instance (`oracle2` VM, Ubuntu 24.04).
- **Runtime Orchestration**: Multi-container Docker Compose with healthchecks (`wget /ready` and `pg_isready`), automated dependency ordering (`service_healthy`), and isolated container network bridge.

---

## 6. CI/CD & Security Automation: GitHub Actions
- **Continuous Integration Pipeline**:
  - Automated triggers on pull requests and pushes to `QA` and `main` branches.
  - Node.js 22 + `pnpm` frozen-lockfile dependency installation.
  - Monorepo compilation and strict TypeScript typechecking (`pnpm typecheck`).
  - Automated migration execution and unit + E2E test runs against a live PostgreSQL 15 Alpine service container.
- **Security Scanning & Compliance**:
  - **Semgrep SAST**: Scans codebase for OWASP Top 10 vulnerabilities, TypeScript/JavaScript security anti-patterns, and injection risks.
  - **Trivy Vulnerability & Secret Scan**: Scans filesystem for high/critical CVEs, misconfigurations, and committed secrets.
  - **pnpm audit**: High-severity package vulnerability checks.
- **Continuous Deployment (CD)**:
  - **Docker Buildx**: Automated build and push of all 10 production container images to Docker Hub using GitHub Actions cache (`type=gha`).
  - **Automated SSH Deployment**: GitHub Actions connects via SSH (`appleboy/ssh-action`) to the `oracle2` VM to fetch latest git commits, pull fresh images from Docker Hub, and execute zero-downtime rolling restart via `docker compose up -d --remove-orphans`.
