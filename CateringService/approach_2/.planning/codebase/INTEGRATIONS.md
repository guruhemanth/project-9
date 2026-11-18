# CaterConnect External Integrations & Services

## APIs & External Services
- **Payment Gateway (Razorpay)**:
  - Handles escrow payments with dynamic splitting (25% advance to lock caterer calendar vs 100% full upfront).
  - Webhook endpoint at `/api/payments/webhook` with HMAC-SHA256 signature verification.
  - Test/sandbox keys configured in `backend/services/payment`.
- **Google OAuth 2.0**:
  - `google-auth-library` verification at `/api/auth/google`.
  - Automatically provisions or links customer accounts with verified emails.
- **WhatsApp Direct Connect**:
  - Customer-to-caterer click-to-chat URI scheme (`https://wa.me/<phone>?text=...`) for quick event coordination.
- **Web Push Notifications**:
  - VAPID keypair generation for browser push subscriptions stored in `notify_svc.push_subscriptions`.

## Data Storage
- **PostgreSQL 16**:
  - Centralized ACID database strictly partitioned by domain into 6 isolated schemas:
    1. `auth_svc`: User credentials, roles, Google auth links, profile details.
    2. `caterer_svc`: Approved caterer profiles, master dish items, package listings, blackout dates, commission settings.
    3. `order_svc`: Booking inquiries, party guest numbers, custom dishes, status machine, status audit trail.
    4. `pay_svc`: Payment transactions, escrow holding, settlements, commission fees.
    5. `notify_svc`: Notification outbox, push device subscriptions, delivery state.
    6. `chat_svc`: Inquiry conversation threads, real-time messages, participant relations.
  - Connection pooling via `pg.Pool` with connection retry and health checks.

## Authentication & Identity
- **Client Authentication**: Bearer JWT token issued upon `/api/auth/login` or `/api/auth/google`.
- **Internal Microservice Trust**:
  - API Gateway validates incoming client JWTs.
  - Gateway strips any incoming client spoofing headers (`x-user-id`, `x-user-role`, `x-internal-token`).
  - Gateway signs a cryptographic HMAC-SHA256 internal token and injects verified `x-user-id` and `x-user-role` headers into upstream service requests.

## Monitoring & Observability
- **Health Checks**:
  - Every microservice and gateway exposes `GET /health` (liveness) and `GET /ready` (readiness with database probe).
  - Docker Compose uses Docker healthchecks with 10s intervals and 3 retries.
- **Structured Logging**:
  - `pino` format outputting machine-readable JSON with request IDs (`reqId`), response times, and status codes.
  - Automatic redaction of sensitive credentials and PII.

## CI/CD & Deployment
- **Repository**: Git repository at `https://github.com/guruhemanth/project-9.git` (active branch: `QA`).
- **Deployment Strategy**:
  - Containerized production runtime on Oracle VM host (`129.225.70.124`).
  - Production bundles compiled locally with Vite (`npm run build`) and hot-swapped into Nginx / Node containers via SSH/SCP.
