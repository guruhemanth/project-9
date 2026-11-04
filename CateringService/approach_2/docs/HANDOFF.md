# CaterConnect — Project Status & Architecture Context Handoff

> **Generated for AI Context Synchronization & Status Update**  
> **Repository Location:** `/home/guru/projects/project-9/CateringService/approach_2`  
> **Launch City:** Tirupati, Andhra Pradesh, India  
> **Status:** All 12 Milestones Completed, Tested (36/36), Built, and Running Live  

---

## 1. Project Overview & Identity

**CaterConnect** is a two-sided catering marketplace platform for India, launching in **Tirupati, Andhra Pradesh**. It connects event hosts (customers planning weddings, housewarmings, family functions, and corporate gatherings) with verified, FSSAI-compliant catering businesses.

### Stack & Technologies
- **Monorepo Manager:** `pnpm` workspaces (Node 22+)
- **Backend Microservices:** Fastify, TypeScript, Zod, pg (PostgreSQL driver), `@fastify/jwt`, `@fastify/websocket`, `@fastify/cors`
- **API Gateway:** Fastify with `@fastify/http-proxy` (Central reverse proxy with JWT validation & admin role guards)
- **Database:** PostgreSQL (with strict schema-per-service isolation)
- **Frontend:** Two dedicated mobile-first React 19 + Vite 6 + TypeScript + Tailwind CSS applications
- **Payments:** Razorpay (Dual payment flows: 100% Full Payment or 25% Advance Deal Lock, HMAC-SHA256 webhooks)
- **Testing:** Vitest (36/36 automated integration tests passing across all packages)

---

## 2. Ports & Runtime Deployment Map

The platform is running live on the local environment:

| Service / App | Dev Port | Protocol / Technology | Purpose |
| :--- | :---: | :--- | :--- |
| **PostgreSQL Database** | `54322` | `postgresql://...` | Transactional multi-schema database container |
| **API Gateway** | `8080` | HTTP / Reverse Proxy | Central entry point for all `/api/*` requests with JWT guards |
| **Auth Service** | `4001` | HTTP (Fastify) | JWT issuance, password hashing (bcrypt cost 10), user profiles |
| **Caterer & Menu Service** | `4002` | HTTP (Fastify) | 14-digit FSSAI onboarding, package items, availability calendar |
| **Booking & Order Service** | `4003` | HTTP (Fastify) | Booking state machine, auto-lock dates, dispute cancellations |
| **Payment Service** | `4004` | HTTP (Fastify) | Dual payment orders, Razorpay HMAC webhooks, 15% settlement ledger |
| **Notification Service** | `4005` | HTTP (Fastify) | Transactional WhatsApp deep-links and SMS alert formatting |
| **Chat & Messaging Service**| `4006` | HTTP & WebSocket | In-app 1-to-1 booking chat & real-time WebSocket communication |
| **Customer Web App** | `5173` | Vite / React PWA | Event host discovery, booking, dual payments, chat drawer |
| **Partner & Admin Web App** | `5174` | Vite / React PWA | Caterer dashboard, blackout dates & **Admin Operations Center** |

---

## 3. Currently Implemented Plan & Milestones (1–12)

All 12 milestones have been implemented, tested, and user-approved:

| # | Milestone | Scope & Delivered Features | Status |
| :-: | :--- | :--- | :-: |
| **M1** | **Database Schema, Auth & Roles** | Multi-schema PostgreSQL topology (`auth_svc`), JWT issuance, phone validation (+91 format), password hashing with bcrypt, role-based access (`customer`, `caterer`, `admin`). | ✅ Approved (3/3 Tests) |
| **M2** | **Caterer Onboarding & Verification** | Caterer profile lifecycle (`pending` $\rightarrow$ `approved` / `rejected` / `suspended`), strict 14-digit FSSAI format checking. Unapproved caterers remain invisible to search. | ✅ Approved (5/5 Tests) |
| **M3** | **Menu Packages & Catalog** | Banquet package builder with plate pricing in integer paise. Item categorization: Starters, Traditional Banana Leaf Meals, Sweets, and Beverages. | ✅ Approved |
| **M4** | **Customer Discovery & Booking** | Search Tirupati caterers by cuisine, guest count, and budget. Date conflict checking. Booking creation in `requested` state with automated paise calculations. | ✅ Approved (6/6 Tests) |
| **M5** | **Caterer Booking State Machine** | Strict state machine (`requested` $\rightarrow$ `accepted` $\rightarrow$ `paid` $\rightarrow$ `completed`). 15% platform commission permanently snapshotted at acceptance. Disallowed transitions blocked. | ✅ Approved (State Machine Tests) |
| **M6** | **Dual Payments & Razorpay Webhooks** | Dual payment options: **Option 1 (100% Full Payment)** vs. **Option 2 (25% Advance Deal Lock)**. HMAC-SHA256 webhook signature verification. Payment truth solely from webhooks. | ✅ Approved (5/5 Tests) |
| **M7** | **Reviews & API Gateway Orchestration** | Gateway reverse proxy with JWT forwarding. Customer post-event rating (1-5 stars) and review pipeline with average rating rollups. | ✅ Approved (Gateway Tests) |
| **M8** | **Live Availability & Calendar Management**| Caterer blackout dates manager (`caterer_availability`). Automatic date locking (`auto_locked = true`) upon booking confirmation, preventing double-bookings in Tirupati. | ✅ Approved (Availability Tests) |
| **M9** | **Caterer Payouts & Settlement Ledger** | Payout ledger ensuring $\text{gross} = \text{commission} + \text{net payout}$. Payout disbursement tracking with bank UTR reference numbers. | ✅ Approved (Settlement Tests) |
| **M10**| **Transactional WhatsApp & SMS Alerts** | Notification microservice dispatches transactional SMS and deep-link WhatsApp messages tailored for Tirupati event hosts and caterers. | ✅ Approved (3/3 Tests) |
| **M11**| **Real-Time In-App Messaging** | `chat-service` (:4006) with thread-per-booking isolation. RESTful message history and WebSocket live streaming. Dual-app chat drawers with Tirupati-specific quick action chips. | ✅ Approved (3/3 Tests) |
| **M12**| **Admin Operations Center & Super-Dashboard** | Multi-tab Admin Super-Dashboard: Live GMV & 15% commission KPI cards, FSSAI verification queue (Approve/Reject with reason), master bookings audit log, dispute cancellation, UTR settlement entry. | ✅ Approved (36/36 Tests) |

---

## 4. Dedicated 2-App Architecture

The frontend is cleanly separated into two independent web applications:

```
frontend/
├── customer/                  # @caterconnect/customer-app (Port 5173 / Container 3000)
│   ├── src/
│   │   ├── features/customer/ # CustomerHome, CatererDetailView, CustomerBookingsList
│   │   ├── features/payment/  # PaymentModal (Dual option selector: 100% Full vs 25% Advance)
│   │   ├── features/reviews/  # ReviewModal (1-5 Star rating and comment)
│   │   ├── features/chat/     # ChatDrawer (In-app live messaging with Tirupati suggestions)
│   │   └── lib/api-client.ts  # Typed API Gateway fetcher with JWT headers
│   └── package.json
└── partner/                   # @caterconnect/partner-app (Port 5174 / Container 3001)
    ├── src/
    │   ├── features/caterer/  # CatererDashboard, IncomingRequestsQueue, BlackoutDateManager, PackageList
    │   ├── features/admin/    # AdminDashboard (Analytics, FSSAI Queue, Bookings, Settlements, Commission)
    │   ├── features/chat/     # PartnerChatDrawer (Host coordination messaging)
    │   └── lib/api-client.ts
    └── package.json
```

---

## 5. Non-Negotiable Core Domain Rules

1. **Integer Paise Arithmetic**: Money is stored and computed strictly as integer paise ($1 \text{ INR} = 100 \text{ paise}$, e.g. ₹35,000 is stored as `3500000`). Floating-point money arithmetic is prohibited. Formatting uses `Intl.NumberFormat('en-IN')`.
2. **Deterministic State Transitions**:
   $$\text{requested} \xrightarrow{\text{caterer}} \text{accepted} \xrightarrow{\text{webhook}} \text{paid} \xrightarrow{\text{caterer (on/after event date)}} \text{completed}$$
   Cancellations adhere to tiered refund calculations:
   - Cancelled by Caterer / Admin: 100% refund.
   - Cancelled by Customer: $\ge 7$ days (100%), $3-7$ days (50%), $<3$ days (0%).
3. **Razorpay Webhook as Source of Truth**:
   The frontend never marks a booking as paid. Only the backend webhook verifying the HMAC-SHA256 signature updates booking status to `paid`.
4. **15% Platform Commission Snapshot**:
   When a booking is accepted, the 15% platform commission rate and amount in paise are permanently snapshotted onto the booking record.
5. **Caterer Visibility Rule**:
   A caterer is completely invisible in customer search results until verified and approved by an admin (`status = 'approved'`).

---

## 6. Monorepo Directory Layout

```
/home/guru/projects/project-9/CateringService/approach_2/
├── backend/
│   ├── gateway/                  # Port 8080 (fastify-http-proxy + JWT/Role guards)
│   └── services/
│       ├── auth/                 # Port 4001 (auth_svc)
│       ├── caterer-menu/         # Port 4002 (caterer_svc)
│       ├── booking-order/        # Port 4003 (order_svc)
│       ├── payment/              # Port 4004 (pay_svc)
│       ├── notification/         # Port 4005 (notify_svc)
│       └── chat/                 # Port 4006 (chat_svc)
├── frontend/
│   ├── customer/                 # Port 5173 (@caterconnect/customer-app)
│   └── partner/                  # Port 5174 (@caterconnect/partner-app)
├── shared/                       # Shared domain types, Zod schemas, state machine
├── database/                     # SQL migration scripts (01_init to 06_chat_schema.sql)
├── docs/                         # ARCHITECTURE.md, API_REFERENCE.md, MILESTONES_DELIVERED.md, HANDOFF.md
├── scripts/                      # start-all.sh, stop-all.sh
└── docker-compose.yml            # Container orchestration
```

---

## 7. Current Project Health & Verification

- **Automated Tests:** **36/36 tests passing** (`pnpm -r test`)
  - `shared`: 4/4
  - `gateway`: 4/4
  - `auth`: 3/3
  - `caterer-menu`: 6/6
  - `booking-order`: 7/7
  - `payment`: 6/6
  - `notification`: 3/3
  - `chat`: 3/3
- **TypeScript Strict Mode:** 0 compilation errors across all packages (`tsc`).
- **Running Ecosystem:** All services running as daemons via `scripts/start-all.sh`.
