# State: CaterConnect (Approach 2 - Fastify Microservices)

## Current Status
- Project: CaterConnect (Approach 2 - Fastify Microservices)
- Active Phase: **Phase 10 - Real-Time Web Push & Notification Dispatcher**
- Status: Completed (Verified with 32/32 E2E suites and monorepo build)
- Plan Path: `.planning/phases/phase-10-notifications/PLAN.md`

## Key Decisions Made
- Framework: Fastify (Node.js + TypeScript) for high throughput (~30k req/s) and sub-millisecond latency.
- Shared Library: `packages/shared` containing Zod schemas and TypeScript interfaces shared between React and Fastify services.
- Database: PostgreSQL with service schemas (`auth_svc`, `caterer_svc`, `order_svc`, `pay_svc`, `notify_svc`, `chat_svc`).
- Payments: Razorpay Dual Options (100% Full Payment or 25% Advance to lock the deal).
- Notifications: Transactional Outbox pattern (`notify_svc.notification_outbox`) with asynchronous worker and Web Push (VAPID) delivery.
