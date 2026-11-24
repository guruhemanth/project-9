# CaterConnect Testing Architecture & Standards

## 1. Overview & Testing Philosophy
CaterConnect employs a multi-tiered test architecture ensuring contract stability, tenant boundary isolation, financial precision, and end-to-end integration across all microservices and frontend portals.

The test suite consists of **338+ passing automated tests** across the monorepo:
- **107 Unit & Service Tests**: Verifying individual microservice route logic, schemas, and token signatures.
- **32 End-to-End Test Suites (239+ tests)**: Operating in `tests/e2e/` testing multi-service orchestration, Razorpay workflows, real-time WebSockets, and port separation.

## 2. Testing Framework & Tooling
- **Vitest (v3.2.7)**: Fast, ESM-native testing runner used across all workspace packages and E2E suites.
- **Fastify Injection (`server.inject`)**: Used for zero-network-overhead microservice unit testing.
- **Node TSX & Dedicated E2E Harness**: Comprehensive integration runner utilizing live Fastify server managers and WebSocket clients.
- **Headless PostgreSQL**: Headless Postgres testing harness used for continuous database migration verification and transactional tests.

## 3. Test Suites & Layout Across Monorepo

### Package-Level Unit & Integration Suites
Tests are colocated within each package's `tests/` directory:
- `backend/gateway/tests/`: Gateway routing, reverse proxying, client header stripping, `@fastify/helmet` headers, JWT auth verification, and 10 req/min rate limiting on `/api/auth/login` and `/api/auth/register`.
- `backend/services/auth/tests/`: Password hashing (bcrypt cost 10), Google SSO token exchange, session management, and DPDP compliance.
- `backend/services/caterer-menu/tests/`: 14-digit FSSAI onboarding, dish/package CRUD, dietary tagging (pure veg/non-veg), guest capacity constraints.
- `backend/services/booking-order/tests/`: Booking state machine transitions, booking date auto-locking, and customer data isolation.
- `backend/services/payment/tests/`: Advance vs balance split mathematics (100% full or 25% advance), Razorpay signature HMAC-SHA256 verification, and 15% platform commission calculations.
- `backend/services/notification/tests/`: WhatsApp and SMS notification payload formatting and dispatch outbox.
- `backend/services/chat/tests/`: WebSocket thread authorization, thread-per-booking isolation, and message delivery.
- `shared/tests/`: Zod schema validation, HMAC token signing/verification (`internal-auth`), error definitions, and Indian rupee formatting.

### Monorepo E2E Test Suite (`tests/e2e/`)
Organized into 4 distinct verification tiers across 32 test files:
- **Tier 1: Feature Coverage (`tests/e2e/tier1-feature-coverage/`)**
  - `r1-partner-navigation.test.ts`: Caterer partner navigation and onboarding flows.
  - `r2-realtime-updates.test.ts`: Real-time WebSocket updates and state synchronizations.
  - `r3-admin-app-port-separation.test.ts`: Port separation between Customer (Port 5173), Partner (Port 5174), and Admin (Port 5175).
  - `p1-01-reconciliation.test.ts`: Payment reconciliation and auto-healing.
  - `p1-02-payout-retries.test.ts`: Automated payout failure retry policies.
  - `p1-06-invoicing-taxes.test.ts`: GST tax breakdowns and invoice generation.
  - `p1-07-split-payments.test.ts`: Dual-payment flows (25% advance lock, 75% event-eve balance).
  - `p1-08-onboarding-statuses.test.ts`: Caterer verification lifecycle (`draft` -> `pending` -> `approved` / `rejected`).
  - `p1-09-fssai-signed-urls.test.ts`: Signed URL generation for secure FSSAI document uploads.
  - `p1-10-cancellation-rebook.test.ts`: Tiered cancellation penalties and customer rebooking.
  - `p1-11-outbox-reminders.test.ts`: Outbox pattern for asynchronous transactional notifications.
  - `p1-12-dispute-workflow.test.ts`: Event dispute escalation and admin arbitrations.
  - `p1-14-photo-gate.test.ts`: Verification checks requiring real dish photos before caterer approval.
  - `p1-15-error-alerts.test.ts`: Critical failure alerting and webhook dispatching.
  - `p1-17-ci-pipeline.test.ts`: GitHub Actions CI pipeline triggers, lint gates, and pnpm audit.
  - `p1-19-https-redirect.test.ts`: Insecure HTTP header detection and 301 HTTPS redirection.
  - `p1-20-legal-dpdp.test.ts`: DPDP consent registration gates and public legal route availability.
- **Tier 2: Boundary & Edge Testing (`tests/e2e/tier2-boundary-edge/`)**
  - Edge testing on onboarding, compliance, security, devops, financial tax bounds, navigation, and state machines.
- **Tier 3: Cross-Feature Integration (`tests/e2e/tier3-cross-feature/`)**
  - Complex multi-system interactions (e.g. payment-booking-realtime, photo-fssai-onboarding, dispute-settlement holds).
- **Tier 4: End-to-End Scenarios (`tests/e2e/tier4-end-to-end-scenarios/`)**
  - Complete lifecycles: booking-to-settlement, high-value split payments, caterer onboarding correction, late cancellations, and reconciliation healings.

## 4. Port Separation Test Coverage
Dedicated test coverage in `tests/e2e/tier1-feature-coverage/r3-admin-app-port-separation.test.ts` asserts:
- **Port 5175 Dev Binding**: Admin package `@caterconnect/admin-app` is bound to Port 5175 in `vite.config.ts` and `package.json`.
- **API Gateway Proxy**: Admin portal proxies all `/api` traffic to API Gateway (`http://localhost:8080`).
- **Route Guarding**: Admin dashboard (`/admin/dashboard`) strictly requires `roles={['admin']}`.
- **Partner App Redirection**: Attempted admin route access in partner app redirects cleanly to `http://localhost:5175/admin/dashboard`.
- **Ecosystem Scripts**: Startup/shutdown shell and process scripts launch all three distinct frontend ports (`5173`, `5174`, `5175`).

## 5. Database Migration Testing
- Database migrations located in `database/` are executed and validated using `database/migrator.ts`.
- Migrations maintain reversible up/down SQL definitions across all domain schemas (`auth_svc`, `caterer_svc`, `order_svc`, `pay_svc`, `notify_svc`, `chat_svc`).
- Continuous integration tests run migrations against headless PostgreSQL containers (`postgresql://...:54322/caterconnect`), verifying schema creation, foreign key constraints, and idempotent re-execution.

## 6. Security & Authorization Hole Verification
Every endpoint must pass strict authorization test criteria:
1. **Unauthenticated Rejection**: Requests without valid JWTs must receive `401 Unauthorized`.
2. **Role Tampering Prevention**: Users cannot access routes outside their role (`403 Forbidden`). Client-sent role headers are stripped by the Gateway.
3. **Multi-Tenant Boundary Tests**: Caterers cannot query or modify bookings, menus, or messages belonging to other caterer accounts (`WHERE caterer_id = user.userId`).
4. **Rate Limiting Tests**: Gateway rate limiter blocks rapid credential submissions (>10 req/min on `/api/auth/login` and `/api/auth/register`) with `429 Too Many Requests`.

## 7. Execution Commands
```bash
# Run all unit tests across the entire monorepo
pnpm test

# Run all E2E test suites with serialized workspace execution
pnpm --filter @caterconnect/e2e test

# Run a specific microservice test suite
pnpm --filter @caterconnect/gateway test
pnpm --filter @caterconnect/payment-service test

# Run port separation verification tests specifically
npx vitest run tests/e2e/tier1-feature-coverage/r3-admin-app-port-separation.test.ts

# Execute and check database migrations
pnpm run db:migrate:status
pnpm run db:migrate:up
```
