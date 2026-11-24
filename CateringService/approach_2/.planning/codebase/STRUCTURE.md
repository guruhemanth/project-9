# CaterConnect Codebase Structure

## Overview
CaterConnect is organized as a unified `pnpm` monorepo containing three decoupled frontend Vite applications, six independent backend Fastify microservices, a central API Gateway reverse proxy, shared business logic and contracts, database migration scripts, automated integration suites, and operational scripts.

---

## Directory Layout

```
CateringService/approach_2/
├── .github/
│   └── workflows/
│       └── ci.yml                      # GitHub Actions CI (lint, typecheck, audit, test, build)
├── backend/
│   ├── gateway/                        # Central Ingress API Gateway (Port 8080)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts                # Gateway routing, JWT check, HMAC token injection, proxying
│   │       └── ops-router.ts           # Operational health, docker status & readiness endpoints
│   └── services/                       # 6 Independent Domain Microservices
│       ├── auth/                       # Auth Service (Port 4001, schema: auth_svc)
│       │   ├── Dockerfile
│       │   ├── package.json
│       │   └── src/index.ts            # User auth, password hashing, Google OAuth, session management
│       ├── caterer-menu/               # Caterer & Menu Service (Port 4002, schema: caterer_svc)
│       │   ├── Dockerfile
│       │   ├── package.json
│       │   └── src/index.ts            # FSSAI onboarding, Pan-India location matching, dishes, packages
│       ├── booking-order/              # Booking & Order Service (Port 4003, schema: order_svc)
│       │   ├── Dockerfile
│       │   ├── package.json
│       │   └── src/index.ts            # Booking state machine, auto date locks, custom combos
│       ├── payment/                    # Payment Service (Port 4004, schema: pay_svc)
│       │   ├── Dockerfile
│       │   ├── package.json
│       │   └── src/index.ts            # Razorpay 100%/25% dual payment, webhook HMAC, settlements
│       ├── notification/               # Notification Service (Port 4005, schema: notify_svc)
│       │   ├── Dockerfile
│       │   ├── package.json
│       │   └── src/index.ts            # Transactional WhatsApp, SMS templates, push notifications
│       └── chat/                       # Chat Service (Port 4006, schema: chat_svc)
│           ├── Dockerfile
│           ├── package.json
│           └── src/index.ts            # Thread-per-booking messaging & WebSocket server
├── frontend/                           # Three Decoupled Client Applications
│   ├── customer/                       # Customer Discovery & Booking App (Dev: 5173, Prod: 3000)
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── App.tsx                 # Routing, layout, and session initialization
│   │       ├── features/
│   │       │   ├── auth/               # Login, Register, Google OAuth modal
│   │       │   ├── customer/           # CustomerHome, CatererDetailView, AuthRequiredModal
│   │       │   ├── chat/               # CustomerChatHub, ChatDrawer (WebSocket integration)
│   │       │   ├── payment/            # PaymentModal, Razorpay checkout, escrow breakdown
│   │       │   └── reviews/            # Caterer rating & review submission
│   │       ├── lib/                    # API client, auth context, formatters, websocket helper
│   │       └── types/                  # Customer-side type definitions
│   ├── partner/                        # Caterer / Partner Portal (Dev: 5174, Prod: 3001)
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── App.tsx                 # Partner portal routing & layout
│   │       ├── features/
│   │       │   ├── auth/               # Caterer partner authentication
│   │       │   ├── caterer/            # CatererDashboard, OnboardingForm, MenuItems, Blackouts
│   │       │   └── chat/               # PartnerChatHub, PartnerChatDrawer
│   │       └── lib/                    # Auth context, partner API client
│   └── admin/                          # Platform Operations / Admin App (Dev: 5175, Prod: 3002)
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── package.json
│       ├── vite.config.ts              # Decoupled Vite app configured with Purple Theme
│       └── src/
│           ├── App.tsx                 # Admin dashboard routing & navigation
│           ├── features/admin/         # Operations Center, FSSAI verification, GMV KPIs, Ledgers
│           └── lib/                    # Admin auth context, operations API client
├── database/                           # Database Migrations & Logical Schemas
│   ├── 01_init_schemas.sql             # Base schemas (auth_svc, caterer_svc, order_svc, pay_svc)
│   ├── 02_seed_data.sql                # Base user, caterer, and dish seed data
│   ├── 03_availability_schema.sql      # Caterer blackout dates & auto-lock column
│   ├── 04_settlement_schema.sql        # Payout ledgers & UTR records
│   ├── 05_notification_schema.sql      # Notification events & templates
│   ├── 06_chat_schema.sql              # Chat threads and messages
│   ├── 07_pan_india_location.sql       # 28 States, 8 UTs, city and PIN code extensions
│   ├── 08_dynamic_commission.sql       # Platform commission rules
│   ├── 09_google_auth.sql              # Google OAuth accounts schema
│   ├── 10_push_and_outbox.sql          # Web push subscriptions & transactional outbox
│   ├── 11_customizations_schema.sql    # Custom dish combo recipes
│   ├── 12_dish_images_schema.sql       # Dish gallery images
│   ├── 13_caterer_bank_details_schema.sql # Caterer bank account & IFSC verification
│   ├── 14_instant_booking_and_payment_sync_schema.sql # Instant bookings & status sync
│   ├── 15_launch_hardening.sql         # Data integrity & validation constraints
│   ├── 16_p1_remediation_schema.sql    # Security & performance remediations
│   ├── 17_performance_indexes.sql      # Composite & foreign key performance indexes
│   ├── migrator.ts                     # Automated migration execution runner
│   ├── seed.ts                         # Development database seeder
│   └── seed_100_caterers.ts            # High-volume caterer catalog seeder
├── shared/                             # Shared Library & Contracts (`@caterconnect/shared`)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── constants/                  # Pan-India states, UTs, pilot hubs, food categories
│       ├── internal-auth.ts            # Gateway HMAC token signing and downstream verification
│       ├── state-machine.ts            # Canonical booking state transitions & validator
│       ├── types.ts                    # TypeScript interfaces & shared entity models
│       └── validators.ts               # Shared Zod validation schemas
├── scripts/                            # Operational & DevOps Tooling
│   ├── build-and-push-images.sh        # Builds all 10 Docker images & pushes to Docker Hub
│   ├── start-all.sh                    # Starts all 6 microservices, gateway, and 3 frontend apps
│   ├── stop-all.sh                     # Gracefully terminates all running ecosystem processes
│   ├── verify-local-flow.ts            # Automated health & end-to-end sanity verification script
│   ├── test_session_and_ratelimit_client.ts # Security verification for rate-limiting
│   └── bulk_import_caterer_menus.ts    # Batch menu catalog import utility
├── tests/                              # Automated Test Suites
│   ├── e2e/                            # 231 End-to-End Vitest test suites (Tier 1-4)
│   └── unit/                           # Shared & cross-service unit tests
├── docker-compose.yml                  # Full stack orchestration (PostgreSQL + 6 Services + Gateway + 3 Portals)
├── pnpm-workspace.yaml                 # Monorepo workspace configuration
├── package.json                        # Root commands (test, typecheck, lint, build)
└── .planning/                          # GSD Planning & Architecture Intelligence
    └── codebase/
        ├── ARCHITECTURE.md             # System design, data flow, ingress, and production topology
        └── STRUCTURE.md                # Repository layout, component maps, and developer conventions
```

---

## Key File Locations & Entry Points

| Responsibility | Primary File Location |
| :--- | :--- |
| **API Gateway Ingress** | `backend/gateway/src/index.ts` |
| **HMAC Internal Signing** | `shared/src/internal-auth.ts` |
| **Booking State Machine** | `shared/src/state-machine.ts` |
| **Auth Service Controller** | `backend/services/auth/src/index.ts` |
| **Caterer & Catalog Controller** | `backend/services/caterer-menu/src/index.ts` |
| **Booking & Order Controller** | `backend/services/booking-order/src/index.ts` |
| **Payment & Settlement Controller** | `backend/services/payment/src/index.ts` |
| **Notification Controller** | `backend/services/notification/src/index.ts` |
| **Chat & WebSocket Controller** | `backend/services/chat/src/index.ts` |
| **Customer App Entry** | `frontend/customer/src/App.tsx` & `features/customer/CustomerHome.tsx` |
| **Partner Portal Entry** | `frontend/partner/src/App.tsx` & `features/caterer/CatererDashboard.tsx` |
| **Admin Operations App Entry** | `frontend/admin/src/App.tsx` & `features/admin/AdminDashboard.tsx` |
| **Database Migrations** | `database/migrator.ts` and `database/01_*.sql` through `17_*.sql` |
| **Multi-Service Launch Script** | `scripts/start-all.sh` |
| **Docker Build & Push Automation**| `scripts/build-and-push-images.sh` |
| **Production Container Topology**| `docker-compose.yml` |

---

## Architectural Guidelines for New Code

1. **New API Endpoints**:
   - Implement the endpoint within the domain microservice under `backend/services/<service-name>/src/index.ts`.
   - Update `backend/gateway/src/index.ts` if adding an unauthenticated public route or a specialized role route guard.
2. **Frontend Additions**:
   - **Customer Discovery / Ordering**: Add inside `frontend/customer/src/features/<feature>/`.
   - **Caterer Kitchen / Availability**: Add inside `frontend/partner/src/features/caterer/`.
   - **Operations / Platform Governance**: Add inside `frontend/admin/src/features/admin/` adhering to the Admin purple aesthetic.
3. **Database Changes**:
   - Never modify existing executed migrations. Create the next sequentially numbered migration `database/<N>_<feature>_schema.sql`.
   - Always assign tables to their corresponding schema partition (`auth_svc`, `caterer_svc`, `order_svc`, `pay_svc`, `notify_svc`, `chat_svc`).
   - Register the new SQL migration inside `database/migrator.ts`.
4. **Shared Types & Schemas**:
   - Add data contracts and Zod validators in `shared/src/` to ensure shared consistency across backend services and frontend portals.
