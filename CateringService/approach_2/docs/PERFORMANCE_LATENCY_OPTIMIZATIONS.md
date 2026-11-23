# Platform Performance & Latency Optimizations

## Overview
Date: 2026-11-23  
Target: Microservices backend, PostgreSQL database, API Gateway proxying, and frontend real-time polling loops.

---

## 1. Database Indexing (Migration 17)
**File:** [17_performance_indexes.sql](file:///home/guru/projects/project-9/CateringService/approach_2/database/17_performance_indexes.sql)  
**Registered in:** [migrator.ts](file:///home/guru/projects/project-9/CateringService/approach_2/database/migrator.ts)

Prior to this migration, listing customer bookings and checking caterer booking queues performed sequential table scans over `order_svc.bookings`. In addition, city/service area containment checks in `caterer_svc.caterers` performed full-scan unnest operations.

### Indexes Added:
1. **`idx_bookings_caterer_status_date`** on `order_svc.bookings(caterer_id, status, event_date ASC)`:
   - Optimizes partner portal caterer queue queries and dashboard views from $O(N)$ sequential scans to index scans.
2. **`idx_bookings_customer_created`** on `order_svc.bookings(customer_id, created_at DESC)`:
   - Accelerates customer "My Bookings" retrieval with reverse chronological sort.
3. **`idx_bookings_status_date`** on `order_svc.bookings(status, event_date)`:
   - Enables fast index sweeps for expired 12h pending bookings.
4. **`idx_packages_caterer_id`** on `caterer_svc.packages(caterer_id)`:
   - Eliminates missing foreign-key index overhead when retrieving caterer menu packages.
5. **`idx_package_items_package_id`** on `caterer_svc.package_items(package_id)`:
   - Accelerates package item lookups during menu exploration.
6. **`idx_caterers_service_areas`** on `caterer_svc.caterers USING GIN (service_areas)`:
   - Rapid array containment search (`service_areas @> ARRAY['Tirupati']::varchar[]`).
7. **`idx_payments_booking_id`** on `pay_svc.payments(booking_id)`:
   - Fast lookup of payment status and transaction history per booking.

---

## 2. PostgreSQL Connection Pool Right-Sizing
**Files:** `backend/services/*/src/db.ts` across all 6 microservices:
- [auth/src/db.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/auth/src/db.ts)
- [booking-order/src/db.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/booking-order/src/db.ts)
- [caterer-menu/src/db.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/caterer-menu/src/db.ts)
- [chat/src/db.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/chat/src/db.ts)
- [notification/src/db.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/notification/src/db.ts)
- [payment/src/db.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/payment/src/db.ts)

### Problem:
Each microservice had hardcoded `max: 20` pool connections ($6 \times 20 = 120$), exceeding the standard PostgreSQL connection limit of 100 (`max_connections = 100`). Under load, connection pool exhaustion led to 5,000ms `connectionTimeoutMillis` wait timeouts.

### Optimization:
- Replaced hardcoded connection pool size with `parseInt(process.env.DB_POOL_MAX || '10', 10)` across all microservices.
- Total maximum connection load reduced from 120 to 60, eliminating connection starvation and queuing delay while providing room for administrative tasks and migrator connections.

---

## 3. API Gateway Proxy Keep-Alive & Internal Token Caching
**File:** [backend/gateway/src/index.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/gateway/src/index.ts)

### Optimizations:
1. **Undici HTTP Keep-Alive Agent:**
   - Configured `undici: { connections: 50, pipelining: 1, keepAliveTimeout: 60000, keepAliveMaxTimeout: 600000 }` on `fastifyHttpProxy`.
   - Keeps open persistent TCP sockets between the API Gateway (`:8080`) and upstream microservices (`:4001–4006`), eliminating the latency overhead of per-request TCP handshakes and socket teardowns.
2. **HMAC SHA-256 Gateway Token In-Memory Caching:**
   - Previously, every incoming request triggered a synchronous `signInternalToken()` call performing an HMAC SHA-256 cryptographic digest.
   - Implemented `getCachedInternalToken()` with a 30-second TTL cache (`cachedToken` / `cachedTokenExpiresAt`), reusing valid tokens across concurrent proxy requests and avoiding repeated cryptographic compute.

---

## 4. Frontend Tab Visibility Throttling for Polling Loops
**Files:**
- [customer/src/hooks/useRealtimeUpdates.ts](file:///home/guru/projects/project-9/CateringService/approach_2/frontend/customer/src/hooks/useRealtimeUpdates.ts)
- [partner/src/hooks/useRealtimeUpdates.ts](file:///home/guru/projects/project-9/CateringService/approach_2/frontend/partner/src/hooks/useRealtimeUpdates.ts)

### Problem:
Background tabs continued to poll fallback endpoints every 5 seconds indefinitely, consuming browser CPU, network sockets, and database connections.

### Optimization:
- Integrated `document.hidden` check in the polling interval.
- Added a `visibilitychange` event listener that immediately pauses polling while the browser tab is hidden and triggers an instant refresh upon tab refocus.

---

## 5. Startup Threadpool Tuning
**File:** [scripts/start-all.sh](file:///home/guru/projects/project-9/CateringService/approach_2/scripts/start-all.sh)

- Added `export UV_THREADPOOL_SIZE=${UV_THREADPOOL_SIZE:-16}` to prevent Node.js `libuv` threadpool starvation during concurrent bcrypt password verifications and file I/O operations.

---

## 6. Test Suite & E2E Date Resilience
**Files:**
- [booking-order/tests/booking.test.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/booking-order/tests/booking.test.ts)
- [notification/tests/push-outbox.test.ts](file:///home/guru/projects/project-9/CateringService/approach_2/backend/services/notification/tests/push-outbox.test.ts)
- [tests/e2e/tier4-end-to-end-scenarios/scenario-5-event-dispute-and-admin-refund.test.ts](file:///home/guru/projects/project-9/CateringService/approach_2/tests/e2e/tier4-end-to-end-scenarios/scenario-5-event-dispute-and-admin-refund.test.ts)

- Replaced brittle hardcoded event dates with dynamic date offsets relative to runtime date (`Date.now()`), ensuring dispute 7-day post-event window checks and past-date booking validations remain deterministic across test executions.
- Added outbox table sanitization before batch dispatches in notification tests for idempotency.

---

## 7. Verification Summary
- `pnpm typecheck`: **0 errors** across all packages.
- `pnpm -r run test`: **100% passing** (31 test files, 231 tests).
- `pnpm test:e2e`: **100% passing** across all 4 tiers (31 test files, 231 tests).
