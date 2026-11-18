# CaterConnect Codebase Structure

## Directory Layout
```
CateringService/approach_2/
├── backend/
│   ├── gateway/                  # Fastify API Gateway & Reverse Proxy
│   │   ├── src/index.ts          # Gateway routes, JWT verification & upstream proxy definitions
│   │   └── package.json
│   └── services/                 # Independent Domain Microservices
│       ├── auth/                 # Authentication, Google OAuth & User Management
│       ├── booking-order/        # Bookings lifecycle, status transitions & custom dishes
│       ├── caterer-menu/         # Caterers catalog, master kitchen dishes & packages
│       ├── chat/                 # Real-time chat threads, messaging & inboxes
│       ├── notification/         # Push notifications & transactional alerts
│       └── payment/              # Razorpay escrow, commissions & settlement ledgers
├── frontend/
│   ├── customer/                 # React 19 Customer Discovery & Ordering App
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── auth/         # Login, Register & Google Auth
│   │   │   │   ├── chat/         # CustomerChatHub & ChatDrawer
│   │   │   │   ├── customer/     # CustomerHome, CatererDetailView, CustomComboBuilderModal
│   │   │   │   ├── payment/      # PaymentModal & Escrow Line-Item Sheet
│   │   │   │   └── reviews/      # Customer reviews & ratings
│   │   │   ├── lib/              # AuthContext, API client, formatters
│   │   │   └── types/            # Database entity & frontend type definitions
│   └── partner/                  # React 19 Caterer Portal & Admin Operations Center
│       ├── src/
│       │   ├── features/
│       │   │   ├── admin/        # AdminDashboard, settlements, commission overrides
│       │   │   ├── auth/         # Partner login & registration
│       │   │   ├── caterer/      # CatererDashboard, MenuItemsManager, CatererOrderSettings
│       │   │   └── chat/         # PartnerChatHub & PartnerChatDrawer
│       │   └── lib/              # AuthContext, API client
├── database/                     # Migration Scripts & PostgreSQL Schemas
│   ├── 01_init_schemas.sql       # Initial core schemas
│   ├── 02_seed_data.sql          # Base seed data
│   ├── 06_chat_schema.sql        # Chat threads and messages
│   ├── 11_customizations_schema.sql # Custom combos, menu items & chat threads updated_at
│   └── migrator.ts               # Migration runner
├── shared/                       # Shared Types, Validators, and Helpers
│   ├── src/
│   │   ├── constants/            # Hubs, cities, cuisine types
│   │   ├── internal-auth.ts      # HMAC internal token generation & verification
│   │   └── types.ts              # Domain entity interfaces & Zod schemas
└── .planning/                    # GSD Planning & Architecture Documentation
    └── codebase/                 # Codebase intelligence & map documents
```

## Key File Locations
- **API Gateway Routing**: `backend/gateway/src/index.ts`
- **Chat Service Logic**: `backend/services/chat/src/index.ts`
- **Caterer & Dishes Logic**: `backend/services/caterer-menu/src/index.ts`
- **Booking & Order Logic**: `backend/services/booking-order/src/index.ts`
- **Payment & Escrow Logic**: `backend/services/payment/src/index.ts`
- **Customer UI Entry**: `frontend/customer/src/App.tsx` & `CustomerHome.tsx`
- **Partner UI Entry**: `frontend/partner/src/App.tsx` & `CatererDashboard.tsx`
- **Database Migrations**: `database/migrator.ts` & numbered SQL scripts in `database/`

## Where to Add New Code
- **New Microservice Endpoint**: Add to the corresponding service under `backend/services/<domain>/src/index.ts`. Register proxy path in `backend/gateway/src/index.ts` if a new path prefix is introduced.
- **New Customer Feature**: Add under `frontend/customer/src/features/<domain>/` and integrate into `CustomerHome.tsx` or `CatererDetailView.tsx`.
- **New Partner Feature**: Add under `frontend/partner/src/features/caterer/components/` and register in `CatererDashboard.tsx` tabs.
- **New Database Field / Table**: Create a numbered SQL migration in `database/<N>_migration_name.sql` and register in `database/migrator.ts`.
