# CaterConnect — Project Status & Architecture Context Handoff

> **Generated for AI Context Synchronization & Status Update**  
> **Repository Location:** `/home/guru/projects/project-9/CateringService/approach_2`  
> **Platform Coverage:** Pan-India Multi-State Catering Marketplace (Pilot Hubs: Tirupati, Bengaluru, Hyderabad, Chennai, Mumbai, Delhi NCR)  
> **Status:** All 12 Milestones + Pan-India Expansion + Strict Authentication Booking Gate Completed, Tested (37/37 passing), Built, and Running Live  

---

## 1. Project Overview & Identity

**CaterConnect** is a production-grade, two-sided catering marketplace platform for India. It connects event hosts (customers planning weddings, housewarmings, family functions, and corporate banquets) with verified, FSSAI-compliant catering businesses.

### Stack & Technologies
- **Monorepo Manager:** `pnpm` workspaces (Node 22+)
- **Backend Microservices:** Fastify, TypeScript, Zod, pg (PostgreSQL driver), `@fastify/jwt`, `@fastify/websocket`, `@fastify/cors`
- **API Gateway:** Fastify with `@fastify/http-proxy` (Central reverse proxy with JWT validation & admin role guards)
- **Database:** Dedicated PostgreSQL database `caterconnect` (`postgresql://postgres:postgres@127.0.0.1:54322/caterconnect`) with strict schema-per-service isolation (`auth_svc`, `caterer_svc`, `order_svc`, `pay_svc`, `notify_svc`, `chat_svc`)
- **Frontend:** Two dedicated mobile-first React 19 + Vite 6 + TypeScript + Tailwind CSS applications:
  - `@caterconnect/customer-app` (Port 5173 / Container 3000)
  - `@caterconnect/partner-app` (Port 5174 / Container 3001)
- **Payments:** Razorpay (Dual payment flows: 100% Full Payment or 25% Advance Deal Lock, HMAC-SHA256 webhooks)
- **Testing:** Vitest (37/37 automated integration tests passing across all packages)

---

## 2. Ports & Runtime Deployment Map

The platform runs live on the local environment:

| Service / App | Dev Port | Protocol / Technology | Purpose |
| :--- | :---: | :--- | :--- |
| **PostgreSQL Database** | `54322` | `postgresql://.../caterconnect` | Dedicated multi-schema database container |
| **API Gateway** | `8080` | HTTP / Reverse Proxy | Central entry point for all `/api/*` requests with strict JWT guards |
| **Auth Service** | `4001` | HTTP (Fastify) | JWT issuance, password hashing (bcrypt cost 10), user profiles |
| **Caterer & Menu Service** | `4002` | HTTP (Fastify) | 14-digit FSSAI onboarding, Pan-India location matching, package items, availability |
| **Booking & Order Service** | `4003` | HTTP (Fastify) | Booking state machine, auto-lock dates, venue city/state/pin, dispute cancellations |
| **Payment Service** | `4004` | HTTP (Fastify) | Dual payment orders, Razorpay HMAC webhooks, 15% settlement ledger |
| **Notification Service** | `4005` | HTTP (Fastify) | Transactional WhatsApp deep-links and SMS alert formatting |
| **Chat & Messaging Service**| `4006` | HTTP & WebSocket | In-app 1-to-1 booking chat & real-time WebSocket communication |
| **Customer Web App** | `5173` | Vite / React PWA | Event host discovery, city/region selector, booking gate, dual payments, chat drawer |
| **Partner & Admin Web App** | `5174` | Vite / React PWA | Pan-India caterer onboarding, blackout dates & **Admin Operations Center** |

---

## 3. Verified Test Credentials

All three accounts are seeded with active sessions and password `Password123!`:

| Role | Application | URL | Email | Password | Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer** (Host) | Customer App | [http://localhost:5173/login](http://localhost:5173/login) | `customer@example.com` | `Password123!` | Ramesh Kumar (Event Host) |
| **Caterer** (Partner) | Partner App | [http://localhost:5174/login](http://localhost:5174/login) | `caterer@example.com` | `Password123!` | Srinivasa Rao (Sri Venkateswara Catering) |
| **Admin** (Platform) | Partner App | [http://localhost:5174/login](http://localhost:5174/login) | `admin@caterconnect.in` | `Password123!` | Platform Operations & Verification |

---

## 4. Key Architectural Capabilities

### A. Pan-India Multi-State Expansion & Location Discovery
- **Database Migration (`07_pan_india_location.sql`):** Added `state`, `pincode`, and `address` to `caterer_svc.caterers` and `order_svc.bookings` with indexes on `(LOWER(city), LOWER(state))`.
- **Location Onboarding:** Caterers from any of India's 28 States and 8 Union Territories select their State, City, 6-digit Indian PIN code, Kitchen Address, and dynamically define their serviceable delivery localities/areas via interactive tag chips (e.g. *Koramangala, Indiranagar, Whitefield, Bandra, Alipiri*).
- **Region-Based Customer Discovery:** Customer App (`CustomerHome`) dynamically queries `GET /api/caterers?city=<selected_city>`:
  - Interactive location picker in the Hero section and Navbar.
  - 1-click popular hub filter chips: `All India`, `Tirupati`, `Bengaluru`, `Hyderabad`, `Chennai`, `Mumbai`.
  - Selected city is persisted in `localStorage`.
  - Caterer cards display `MapPin: [City], [State]` badges and serviced delivery areas.
- **Multi-Dimensional Backend Matching:** `caterer-menu-service` matches if the searched location equals the base `city`, `state`, or matches any item in `service_areas`.
- **Active Hubs Endpoint:** `GET /api/caterers/cities` aggregates distinct operating cities with approved caterer counts.

### B. Strict Customer Authentication Booking Gate
- **Unauthenticated Browsing:** Visitors can freely browse dishes, menus, package details, reviews, and pricing.
- **Booking Gate Interception:** Clicking "Request to Book" when unauthenticated intercepts the guest with an informative `<AuthRequiredModal />` ("Sign in to Book Catering").
- **Seamless Return Intent:** "Sign In to Continue" and "Create New Host Account" buttons navigate to `/login` or `/register` with `state: { from: location }`, automatically returning the host to the caterer profile immediately upon authentication.
- **Zero Fallback IDs:** Removed all mock customer fallback IDs (`user?.id || 'mock...'`). The booking modal strictly requires genuine authentication and invokes the real `createBookingRequest` API.
- **Gateway Enforcement:** API Gateway strictly verifies JWT on `POST /api/bookings` and rejects unauthenticated requests with `HTTP 401 Unauthorized` (verified by automated tests).

### C. Zero Mode Switchers & Role Purity
- **No Client-Side Role Toggles:** Removed all demo role switchers, dropdown quick-switchers, and mock mode buttons from both applications.
- **Strict Role Isolation:**
  - `@caterconnect/customer-app` exclusively serves customers. Registration is locked to `role: 'customer'`. Admin/caterer dashboard routes are stripped from the bundle.
  - `@caterconnect/partner-app` serves caterers and platform administrators. Removed any suggestion/prompt for admin login from caterer login. Customer accounts are blocked from accessing partner dashboards.

---

## 5. Summary of Milestones Delivered (1–12 + Extensions)

| # | Milestone / Feature | Scope & Highlights | Status |
| :-: | :--- | :--- | :--- |
| **M1** | **Database Schema, Auth & Roles** | Multi-schema PostgreSQL topology (`auth_svc`), JWT issuance, phone validation (+91), password hashing with bcrypt, role-based access (`customer`, `caterer`, `admin`). | ✅ Approved |
| **M2** | **Caterer Onboarding & Verification** | Caterer profile lifecycle (`pending` $\rightarrow$ `approved` / `rejected` / `suspended`), strict 14-digit FSSAI format checking. Unapproved caterers remain invisible. | ✅ Approved |
| **M3** | **Menu Packages & Catalog** | Banquet package builder with plate pricing in integer paise. Categories: Starters, Traditional Banana Leaf Meals, Sweets, Beverages. | ✅ Approved |
| **M4** | **Customer Discovery & Booking** | Search caterers by cuisine, guest count, and budget. Date conflict checking. Booking creation in `requested` state with automated paise arithmetic. | ✅ Approved |
| **M5** | **Caterer Booking State Machine** | Strict state machine (`requested` $\rightarrow$ `accepted` $\rightarrow$ `paid` $\rightarrow$ `completed`). 15% platform commission permanently snapshotted at acceptance. | ✅ Approved |
| **M6** | **Dual Payments & Razorpay Webhooks** | Dual payment options: **Option 1 (100% Full Payment)** vs. **Option 2 (25% Advance Deal Lock)**. HMAC-SHA256 webhook signature verification. Payment truth solely from webhooks. | ✅ Approved |
| **M7** | **Reviews & API Gateway Orchestration** | Gateway reverse proxy with JWT forwarding. Customer post-event rating (1-5 stars) and review pipeline with average rating rollups. | ✅ Approved |
| **M8** | **Live Availability & Calendar Management**| Caterer blackout dates manager (`caterer_availability`). Automatic date locking (`auto_locked = true`) upon booking confirmation, preventing double-bookings. | ✅ Approved |
| **M9** | **Caterer Payouts & Settlement Ledger** | Payout ledger ensuring $\text{gross} = \text{commission} + \text{net payout}$. Payout disbursement tracking with bank UTR reference numbers. | ✅ Approved |
| **M10**| **Transactional WhatsApp & SMS Alerts** | Notification microservice dispatches transactional SMS and deep-link WhatsApp messages tailored for event hosts and caterers. | ✅ Approved |
| **M11**| **Real-Time In-App Messaging** | `chat-service` (:4006) with thread-per-booking isolation. RESTful message history and WebSocket live streaming. Dual-app chat drawers. | ✅ Approved |
| **M12**| **Admin Operations Center & Super-Dashboard** | Multi-tab Admin Super-Dashboard: Live GMV & 15% commission KPI cards, FSSAI verification queue (Approve/Reject with reason), master bookings audit log, dispute cancellation, UTR settlement entry. | ✅ Approved |
| **EXT**| **Pan-India Expansion & Location Discovery** | Support for all 28 Indian States & 8 UTs. Location capture during caterer onboarding. Live customer region filtering with active hubs and persistence. | ✅ Approved |
| **EXT**| **Customer Authentication Booking Gate** | Intercepts unauthenticated "Request to Book" with `<AuthRequiredModal />`, zero mock customer fallback IDs, real API booking submission. | ✅ Approved |

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
│   │   └── src/features/customer/components/
│   │       ├── CustomerHome.tsx          # Dynamic city/hub selector + caterer cards
│   │       ├── CatererDetailView.tsx     # Caterer menu packages & auth gate trigger
│   │       ├── AuthRequiredModal.tsx     # Sign in required gate modal
│   │       └── BookingRequestModal.tsx   # Real API booking request submission
│   └── partner/                  # Port 5174 (@caterconnect/partner-app)
│       └── src/features/caterer/components/
│           ├── CatererOnboardingForm.tsx # 28 States + 8 UTs, PIN, dynamic localities
│           ├── CatererDashboard.tsx      # Kitchen workflow & orders
│           └── ...
├── shared/                       # Shared domain types, Zod schemas, state machine, Indian location constants
├── database/                     # SQL migration scripts (01_init to 07_pan_india_location.sql)
├── docs/                         # ARCHITECTURE.md, API_REFERENCE.md, MILESTONES_DELIVERED.md, HANDOFF.md
├── scripts/                      # start-all.sh, stop-all.sh
└── docker-compose.yml            # Container orchestration
```

---

## 7. Current Project Health & Test Summary

- **Automated Tests:** **37 / 37 passing** (`pnpm -r test`):
  - `shared`: 4/4
  - `gateway`: 5/5 (includes blocking unauthenticated customer booking creation)
  - `auth`: 3/3
  - `caterer-menu`: 6/6 (includes Pan-India location & regional filter tests)
  - `booking-order`: 7/7
  - `payment`: 6/6
  - `notification`: 3/3
  - `chat`: 3/3
- **TypeScript Strict Mode:** 0 compilation errors across all packages (`tsc`).
- **Running Ecosystem:** All services running as daemons via `scripts/start-all.sh`.
