# CaterConnect Technology Stack

## Architecture Overview
- **Monorepo Architecture**: Managed via `pnpm` workspace (Node.js 20+ / 22 LTS, `pnpm@12.16.1`) with shared packages and TypeScript project references.
- **Frontend Applications**: Three independent, dedicated React 19 single-page applications (Customer, Partner, Admin).
- **Backend Architecture**: Fastify v5 API Gateway acts as a single ingress/reverse proxy orchestrating 6 domain-isolated microservices.
- **Database Architecture**: PostgreSQL 15/16 with strict schema-per-service isolation (`auth_svc`, `caterer_svc`, `order_svc`, `pay_svc`, `notify_svc`, `chat_svc`).
- **Containerization & Deployment**: 10 container multi-service Docker Compose topology published to Docker Hub (`guruhemanth/*`) and deployed to Oracle Cloud Infrastructure (oracle2 VM).

---

## Languages & Runtimes
- **TypeScript**: v5.9.3 (strict mode enforced across all workspaces, 0 type errors).
- **Node.js**: v22 LTS (Docker Alpine containers and local runtime; Node 20+ in CI).
- **SQL**: PostgreSQL 15/16 multi-schema DDL/DML, transactional migrations (`database/migrator.ts`).
- **HTML5 & CSS3**: Styled using Tailwind CSS v4 with modern responsive utility classes.

---

## Frontend Applications (React 19 + Vite 6 + Tailwind CSS v4)
All three web applications are independent mobile-first PWAs:
1. **Customer Web App (`@caterconnect/customer-app`)**:
   - **Directory**: `frontend/customer`
   - **Ports**: Docker Container port `3000` (Nginx/HTTP), Local Vite dev port `5173`.
   - **Features**: Event host discovery, region/hub filter chips (All India, Tirupati, Bengaluru, Hyderabad, Chennai, Mumbai), dynamic caterer search, banquet package configuration, unauthenticated booking interception gate (`<AuthRequiredModal />`), dual payment selection (100% full payment vs 25% advance deal lock), booking status tracker, real-time booking chat drawer.
2. **Partner Web App (`@caterconnect/partner-app`)**:
   - **Directory**: `frontend/partner`
   - **Ports**: Docker Container port `3001` (Nginx/HTTP), Local Vite dev port `5174`.
   - **Features**: Caterer onboarding (all 28 Indian States & 8 UTs, 14-digit FSSAI, 6-digit PIN, serviceable localities), package creation, order pipeline & kitchen workflow, blackout dates/availability calendar management, bank payout settlements.
3. **Dedicated Admin Web App (`@caterconnect/admin-app`)**:
   - **Directory**: `frontend/admin`
   - **Ports**: Docker Container ports `3002` & `5175` (Nginx/HTTP), Local Vite dev port `5175`.
   - **Features**: Dedicated operations center with purple administrative branding, strict role-based auth (`role: 'admin'`), platform GMV & 15% commission KPI tracking, caterer FSSAI approval/rejection queue with reason logging, system-wide booking audit logs, dispute cancellation resolution, payout UTR entry.

### Frontend Dependencies & Tooling
- **Core UI**: React v19.0.0, `react-dom` v19.0.0
- **Routing**: `react-router-dom` v7.1.5 (with route guards `RequireAuth`, `RequireRole`)
- **Styling**: `tailwindcss` v4.0.0, `@tailwindcss/vite` v4.0.0, `clsx`, `tailwind-merge`
- **Icons**: `lucide-react`
- **Validation**: `zod` v3.23.8 / v3.24.2
- **Build & Dev**: `vite` v6.0.7, `@vitejs/plugin-react` v4.3.4, `typescript` v5.7/v5.9

---

## Backend Services & Microservices (Fastify v5)
The backend employs Fastify v5 for high-throughput, low-overhead HTTP and WebSocket processing:

### 1. API Gateway (`@caterconnect/api-gateway`)
- **Port**: `8080` (public HTTP/WebSocket ingress).
- **Framework**: Fastify v5.2.0.
- **Plugins**: `@fastify/http-proxy` v10.0.1, `@fastify/jwt` v9.0.1, `@fastify/rate-limit` v11.2.2, `@fastify/cors` v10.0.1, `@fastify/helmet` v13.2.0.
- **Responsibilities**:
  - Central ingress routing for all `/api/*` endpoints to upstream microservices.
  - Public route bypass (health check, customer catalog discovery, auth login/register, Razorpay webhook).
  - Strict Bearer JWT verification for protected endpoints.
  - Anti-spoofing header hygiene (strips incoming `x-user-id`, `x-user-role`, `x-internal-token`).
  - Cryptographic HMAC-SHA256 internal token generation with 30s in-memory TTL cache.
  - Undici HTTP keep-alive connection pooling to microservices.

### 2. Microservices Architecture (Fastify v5 + Zod + pg)
- **Auth Service (`@caterconnect/auth-service`)**:
  - **Port**: `4001`
  - **Database Schema**: `auth_svc`
  - **Responsibilities**: JWT issuance (15m access token, refresh token rotation with reuse revocation), bcrypt password hashing (cost 10), Google OAuth token verification (`google-auth-library`), user profiles.
- **Caterer & Menu Service (`@caterconnect/caterer-menu-service`)**:
  - **Port**: `4002`
  - **Database Schema**: `caterer_svc`
  - **Responsibilities**: Caterer lifecycle (`pending` -> `approved`/`rejected`/`suspended`), 14-digit FSSAI validation, Pan-India multi-state location matching, banquet packages and dish catalog, blackout dates / calendar availability.
- **Booking & Order Service (`@caterconnect/booking-order-service`)**:
  - **Port**: `4003`
  - **Database Schema**: `order_svc`
  - **Responsibilities**: Strict booking state machine (`requested` -> `accepted` -> `paid` -> `completed` / `cancelled`), date auto-locking, guest count & integer paise price calculation, dispute cancellations.
- **Payment Service (`@caterconnect/payment-service`)**:
  - **Port**: `4004`
  - **Database Schema**: `pay_svc`
  - **Responsibilities**: Razorpay dual payment order creation (100% full payment vs 25% advance lock), HMAC-SHA256 webhook processing, payment idempotency and dead-lettering, 15% platform commission snapshotting, settlement ledger.
- **Notification Service (`@caterconnect/notification-service`)**:
  - **Port**: `4005`
  - **Database Schema**: `notify_svc`
  - **Responsibilities**: Transactional alert formatting, WhatsApp deep-links (`wa.me`), SMS formatting, web push notification subscriptions.
- **Chat Service (`@caterconnect/chat-service`)**:
  - **Port**: `4006`
  - **Database Schema**: `chat_svc`
  - **Responsibilities**: Real-time 1-to-1 customer-caterer messaging over `@fastify/websocket`, message persistence, thread isolation per booking inquiry.

---

## Database Architecture
- **Database Engine**: PostgreSQL 15 / 16.
- **Connection Port**: `54322` (host) / `5432` (internal container).
- **Driver**: `pg` (v8.13 / v8.23) and `pg-pool` with pool right-sizing (max 10 connections per service).
- **Multi-Schema Topology**:
  - `auth_svc`: Users, credentials, refresh tokens, Google auth profiles.
  - `caterer_svc`: Caterer profiles, FSSAI registrations, packages, menu dishes, availability.
  - `order_svc`: Booking requests, event details, guest counts, state machine history.
  - `pay_svc`: Razorpay orders, transactions, webhook event logs, settlements.
  - `notify_svc`: Outbox messages, push subscriptions, delivery logs.
  - `chat_svc`: Inquiry conversation threads, real-time messages.
- **Migrations**: Automated TypeScript migration runner (`database/migrator.ts`, migrations 01 through 17).

---

## Testing & Quality Assurance
- **Test Framework**: Vitest v3 / v5, `@testing-library/react`, `jsdom`.
- **Test Coverage**: Over 338 automated tests (107 unit tests + 231 end-to-end tests across 32 suites) with 100% passing status.
- **Static Analysis & Security**:
  - ESLint and strict TypeScript typechecking (`pnpm typecheck`).
  - Semgrep SAST scanning for OWASP Top 10 vulnerabilities.
  - Trivy vulnerability & secret scanning for CVEs and hardcoded credentials.

---

## Infrastructure, Containerization & CI/CD
- **Image Registry**: Docker Hub repository under `guruhemanth/*`:
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
- **Orchestration**: Multi-container `docker-compose.yml` with container healthchecks, internal network bridges, and persistent volume mounts.
- **Host VM**: Oracle Cloud Infrastructure VM (`oracle2`, Ubuntu 24.04).
- **CI/CD Pipeline**: GitHub Actions (`.github/workflows/deploy.yml` / `ci.yml`) triggering on pushes to `QA` branch:
  1. Strict typecheck, build, migration, unit & E2E tests against PostgreSQL container.
  2. Security audit (`pnpm audit`), Semgrep SAST, Trivy CVE & secret scan.
  3. Docker Buildx multi-platform build & push of all 10 images to Docker Hub.
  4. Automated SSH deployment to `oracle2` VM (`docker compose pull && docker compose up -d`).
