# Roadmap: CaterConnect (Approach 2 - Fastify Microservices)

## Phase Structure & Execution Milestones

| Phase | Description | Deliverables | Status |
| :---: | :--- | :--- | :---: |
| **Phase 1** | **Monorepo & Shared Domain Contracts** | `pnpm-workspace.yaml`, `packages/shared` (Zod schemas, types, paise helpers) | Pending |
| **Phase 2** | **PostgreSQL Service Schemas & Migrations** | Schemas for `auth_svc`, `caterer_svc`, `order_svc`, `pay_svc`, initial seed data | Pending |
| **Phase 3** | **Auth Service (`services/auth-service`)** | Fastify JWT auth, bcrypt password hashing, login & registration endpoints | Pending |
| **Phase 4** | **Caterer & Menu Service (`services/caterer-menu-service`)** | Fastify caterer onboarding, FSSAI verification, package CRUD | Pending |
| **Phase 5** | **Booking & Order Service (`services/booking-order-service`)** | Fastify booking state machine (`accept_booking`, `reject_booking`, `cancel_booking`) | Pending |
| **Phase 6** | **Payment Service (`services/payment-service`)** | Fastify Razorpay integration with Dual Payment Options (Full vs 25% Advance) & HMAC webhook | Pending |
| **Phase 7** | **API Gateway (`services/api-gateway`)** | Fastify gateway reverse proxy on port 8080 with JWT route guards | Pending |
| **Phase 8** | **Frontend Client & Docker Compose Deployment** | React 19 web app wired to API Gateway, multi-stage Dockerfiles, `docker-compose.yml` | Pending |
