# Deploying CaterConnect (Approach 2 Microservices)

This runbook covers environment provisioning, Docker deployment, TLS termination, schema migrations, and operational maintenance for the CaterConnect platform.

---

## 1. Environment Variables Specification

The platform requires the following environment variables across services and edge gateways:

| Variable | Target Service(s) | Sensitive? | Purpose / Constraints |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | All Services & Frontends | No | `production` / `staging` / `development` / `test` |
| `DATABASE_URL` | Microservices, Migrations | **Yes** | Postgres connection string (`postgresql://user:pass@host:5432/caterconnect`) |
| `JWT_SECRET` | Gateway, Auth Service | **Yes** | 64-char hex string (Min 32 characters) for signing and verifying tokens |
| `RAZORPAY_KEY_ID` | Payment Service | No | Razorpay merchant API key ID (e.g. `rzp_live_...`) |
| `RAZORPAY_KEY_SECRET` | Payment Service | **Yes** | Razorpay secret API key |
| `RAZORPAY_WEBHOOK_SECRET` | Payment Service | **Yes** | Webhook secret verified via byte-exact HMAC SHA-256 |
| `GOOGLE_CLIENT_ID` | Auth Service, Customer PWA | No | Google Cloud Console OAuth 2.0 Web Client ID |
| `NOTIFY_MODE` | Notification Service | No | `live` or `log` (defaults to `log` in dev/staging) |
| `VAPID_PUBLIC_KEY` | Notification Service, PWAs | No | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Notification Service | **Yes** | Web Push VAPID private key |
| `VAPID_SUBJECT` | Notification Service | No | Contact URI for push services (e.g. `mailto:support@caterconnect.in`) |
| `ALLOWED_ORIGINS` | Gateway & Microservices | No | Comma-delimited list of trusted client origins |
| `PORT` | All Services | No | Listening port (Gateway: `8080`, Auth: `4001`, etc.) |

---

## 2. Cross-Schema Database Architecture & Role Isolation

### Existing Cross-Schema Relationships
In CaterConnect approach 2, microservices share a single PostgreSQL cluster partitioned into clean schemas:
- `auth_svc` (User identities, Google sub IDs, sessions)
- `caterer_svc` (Caterer profiles, menus, packages, availability)
- `order_svc` (Bookings, state machine history)
- `pay_svc` (Razorpay payments, escrow, caterer settlements)
- `notify_svc` (Outbox, delivery logs, push subscriptions)
- `chat_svc` (Threads, messages)

#### Cross-Schema Access Audit:
- **`order_svc` (Booking Service):**
  - Reads `caterer_svc.caterers` & `caterer_svc.packages` to validate availability, price per plate, and ownership.
  - Reads `auth_svc.users` to verify phone number completion.
- **`pay_svc` (Payment Service):**
  - Reads & updates `order_svc.bookings` for payment lock transitions and amount verification.
  - Reads `caterer_svc.caterers` for platform commission snapshotting and owner verification.
- **`chat_svc` (Chat Service):**
  - Reads `order_svc.bookings` and `caterer_svc.caterers` for thread party access control.
- **`notify_svc` (Notification Service):**
  - Reads `order_svc.bookings`, `caterer_svc.caterers`, and `auth_svc.users` to resolve customer and caterer contact details.

### Recommended Production Role Strategy
Instead of granting broad `SUPERUSER` privileges, create dedicated Postgres roles per service:
```sql
-- Example for booking_svc_role
CREATE ROLE booking_role LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA order_svc, caterer_svc, auth_svc, notify_svc TO booking_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA order_svc TO booking_role;
GRANT SELECT ON ALL TABLES IN SCHEMA caterer_svc, auth_svc TO booking_role;
GRANT INSERT ON notify_svc.notification_outbox TO booking_role;
```

---

## 3. Migration Runner & Schema Upgrades

All database changes are structured as forward-only SQL migrations in `database/`:
- `01_init_schemas.sql` to `10_push_and_outbox.sql`

To run database migrations in production:
```bash
# Execute migrator
cd CateringService/approach_2
pnpm tsx database/migrator.ts
```

---

## 4. Reverse Proxy & TLS Termination (Nginx / Caddy)

All external traffic enters through a TLS-terminating reverse proxy routing to the API Gateway (`:8080`) and frontends (`:3000`, `:3001`):

```nginx
# Example Nginx configuration
server {
    listen 443 ssl http2;
    server_name api.caterconnect.in;

    ssl_certificate /etc/letsencrypt/live/caterconnect.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/caterconnect.in/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support for Chat
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 5. PostgreSQL Backup & Disaster Recovery

### Automated Nightly Backup
```bash
pg_dump -h 127.0.0.1 -U postgres -d caterconnect -Fc -f "/var/backups/caterconnect_$(date +%Y%m%d_%H%M%S).dump"
```

### Point-In-Time Restore
```bash
# Stop application services first
docker compose stop gateway auth caterer-menu booking-order payment notification chat

# Restore database from snapshot
pg_restore -h 127.0.0.1 -U postgres -d caterconnect --clean --if-exists /var/backups/caterconnect_TARGET_SNAPSHOT.dump

# Restart application services
docker compose up -d
```

---

## 6. Zero-Downtime Rollback Procedure

If a deployed release shows errors or fails health checks:
1. Re-tag or pull the previous stable Docker image:
   ```bash
   docker compose pull gateway auth caterer-menu booking-order payment notification chat
   ```
2. Restart the containers with rolling zero-downtime updates:
   ```bash
   docker compose up -d --no-deps <service-name>
   ```
3. Verify `/health` and `/ready` return HTTP 200:
   ```bash
   curl -f http://localhost:8080/health
   curl -f http://localhost:8080/ready
   ```
