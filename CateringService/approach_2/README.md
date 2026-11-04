# CaterConnect — Catering Marketplace Platform

> Two-sided catering marketplace for India (Launch City: **Tirupati, Andhra Pradesh**).  
> Built with a high-performance **Fastify (Node.js + TypeScript) microservices** backend, **PostgreSQL** with schema isolation, **Razorpay** dual payment flows, and two dedicated **React + Vite** mobile-first web applications.

---

## 🏛️ System Architecture

CaterConnect is built as a modular microservices monorepo managed via `pnpm` workspaces:

```
                               ┌─────────────────────────────────────────┐
                               │           CaterConnect Clients          │
                               ├────────────────────┬────────────────────┤
                               │ Customer App :5173 │ Partner App  :5174 │
                               │ (Hosts & Feasts)   │ (Caterer & Admin)  │
                               └─────────┬──────────┴──────────┬─────────┘
                                         │                     │
                                         ▼                     ▼
                               ┌─────────────────────────────────────────┐
                               │       API Gateway (:8080)               │
                               │  - Reverse Proxy (fastify-http-proxy)   │
                               │  - JWT Verification & Role Guards       │
                               └────────────────────┬────────────────────┘
                                                    │
         ┌───────────────────┬──────────────────────┼───────────────────┬───────────────────┐
         ▼                   ▼                      ▼                   ▼                   ▼
  ┌─────────────┐     ┌─────────────┐        ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │ Auth Svc    │     │ Caterer Svc │        │ Booking Svc │     │ Payment Svc │     │ Chat Svc    │
  │ Port: 4001  │     │ Port: 4002  │        │ Port: 4003  │     │ Port: 4004  │     │ Port: 4006  │
  └──────┬──────┘     └──────┬──────┘        └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
         │                   │                      │                   │                   │
         └───────────────────┴───────────┬──────────┴───────────────────┴───────────────────┘
                                         ▼
                               ┌───────────────────┐
                               │ PostgreSQL :5432  │
                               │  - auth_svc       │
                               │  - caterer_svc    │
                               │  - order_svc      │
                               │  - pay_svc        │
                               │  - notify_svc     │
                               │  - chat_svc       │
                               │  - review_svc     │
                               └───────────────────┘
```

---

## 📱 Dedicated Frontend Applications

The user experience is split into two distinct, role-specialized applications:

1. **Host & Customer App (`frontend/customer` — Port 5173 / Container 3000)**:
   - Browse approved caterers in Tirupati filtered by cuisine, budget, and guest capacity.
   - Interactive banquet menu package explorer with dish selections (starters, traditional banana leaf meals, sweets).
   - Booking request flow with immediate total estimate calculation.
   - Dual payment options (100% Full Payment or 25% Advance Deal Lock).
   - In-app live chat drawer with caterer coordination suggestions.
   - Post-event caterer rating and review submission.

2. **Partner & Admin App (`frontend/partner` — Port 5174 / Container 3001)**:
   - **Caterer Portal**:
     - 14-digit FSSAI onboarding & profile management.
     - Custom banquet package and menu builder (plate pricing in paise).
     - Incoming requests queue (Accept/Reject with custom notes).
     - Live availability & blackout date manager (with auto-lock for confirmed bookings).
     - Settlement & payout ledger (15% platform commission snapshot, UTR tracking).
     - Host live chat coordination drawer.
   - **Admin Operations Center**:
     - Platform GMV, 15% commission revenue, and settlement disbursement KPI cards.
     - Caterer verification queue (Approve/Reject with mandatory reason/Suspend).
     - Master bookings log with dispute resolution cancellations.
     - Bank UTR payout recording modal.
     - Platform commission settings.

---

## 🔌 Port Allocation Map

| Component / Service | Local Dev Port | Docker Container Port | Responsibilities |
| :--- | :---: | :---: | :--- |
| **PostgreSQL Database** | `5432` / `54322` | `5432` | Schema-isolated transactional store |
| **API Gateway** | `8080` | `8080` | Reverse proxy, JWT & admin role verification |
| **Auth Service** | `4001` | `4001` | Phone & email authentication, JWT issuance |
| **Caterer & Menu Service** | `4002` | `4002` | 14-digit FSSAI validation, packages, availability calendar |
| **Booking & Order Service** | `4003` | `4003` | Booking state machine, auto-locking, dispute cancellations |
| **Payment Service** | `4004` | `4004` | Dual payment orders, Razorpay HMAC webhooks, settlements |
| **Notification Service** | `4005` | `4005` | Transactional WhatsApp links & SMS alerts |
| **Chat & Messaging Service**| `4006` | `4006` | REST message history & WebSocket live streaming |
| **Customer App** | `5173` | `3000` | Event host discovery and booking application |
| **Partner App** | `5174` | `3001` | Caterer dashboard & Admin Operations Center |

---

## 🛠️ Non-Negotiable Core Domain Rules

1. **Integer Paise Arithmetic**: Money is **always** calculated and stored as integer paise (e.g., ₹35,000 = `3500000` paise). Floats are forbidden for currency calculations. Formatting uses `Intl.NumberFormat('en-IN')`.
2. **Deterministic Booking State Machine**:
   - `requested` $\rightarrow$ `accepted` $\rightarrow$ `paid` $\rightarrow$ `completed`
   - Disallowed transitions (e.g., completing an unpaid booking or skipping caterer acceptance) are strictly rejected at the database and API levels.
3. **Razorpay Webhook as Source of Payment Truth**:
   - A booking is never marked `paid` by browser confirmation. Only a cryptographically verified Razorpay webhook (`order.paid` or `payment.captured`) with HMAC-SHA256 signature moves a booking to `paid`.
4. **15% Platform Commission Snapshot**:
   - At the moment of caterer acceptance, the platform commission (15.00%) and commission amount in paise are permanently snapshotted onto the booking record.
5. **Caterer Visibility Constraint**:
   - Caterers remain completely invisible to customers in search results until approved (`caterers.status = 'approved'`) by an admin after 14-digit FSSAI verification.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js 20+ (Node 22 recommended)
- `pnpm` 10+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker & Docker Compose

### Option A: Run with Docker Compose (Recommended)

1. Clone and navigate to the project directory:
   ```bash
   cd /home/guru/projects/project-9/CateringService/approach_2
   ```

2. Start the entire ecosystem (Database, 6 Microservices, Gateway, 2 Web Apps):
   ```bash
   docker compose up --build
   ```

3. Open your browser:
   - **Customer App**: [http://localhost:3000](http://localhost:3000)
   - **Partner & Admin App**: [http://localhost:3001](http://localhost:3001)
   - **API Gateway**: [http://localhost:8080/health](http://localhost:8080/health)

---

### Option B: Local Development

1. Install dependencies across all monorepo packages:
   ```bash
   pnpm install
   ```

2. Build the shared domain contracts:
   ```bash
   pnpm --filter @caterconnect/shared build
   ```

3. Start PostgreSQL and apply schemas:
   ```bash
   # Run local postgres container on 5432
   # Schemas are in database/01_*.sql to 06_*.sql
   ```

4. Run all microservices in parallel:
   ```bash
   pnpm -r --filter "./backend/**" dev
   ```

5. Run frontend applications:
   ```bash
   # Customer App (:5173)
   pnpm --filter @caterconnect/customer-app dev

   # Partner & Admin App (:5174)
   pnpm --filter @caterconnect/partner-app dev
   ```

---

## 🧪 Testing & Verification

Run the full automated integration test suite across all 10 monorepo packages:

```bash
pnpm -r test
```

**Results:**
- **36/36 tests passing** (100% test pass rate across gateway, auth, caterer, booking, payment, notification, chat, and shared modules).
- **TypeScript Strict Mode:** 0 compilation errors across both frontends and backend services (`tsc`).

---

## 🔑 Demo Seed Accounts

| Role | Email / Login | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **Customer** | `customer@caterconnect.com` | `Password123!` | Explore caterers, book feasts, pay full/advance, rate & chat |
| **Caterer** | `caterer@svck.com` | `Password123!` | Manage packages, accept bookings, blackout dates, view payouts |
| **Admin** | `admin@caterconnect.com` | `Password123!` | Verify FSSAI licenses, GMV analytics, dispute cancellations, UTR payouts |

---

## 📚 Documentation Links
- [Complete AI Status & Architecture Handoff](file:///home/guru/projects/project-9/CateringService/approach_2/docs/HANDOFF.md)
- [Detailed Architecture & Microservice Specs](file:///home/guru/projects/project-9/CateringService/approach_2/docs/ARCHITECTURE.md)
- [Complete API Reference Guide](file:///home/guru/projects/project-9/CateringService/approach_2/docs/API_REFERENCE.md)
- [Milestones Delivery Summary](file:///home/guru/projects/project-9/CateringService/approach_2/docs/MILESTONES_DELIVERED.md)
