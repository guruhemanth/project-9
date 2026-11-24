# CaterConnect Technical Debt, Known Issues & Architectural Concerns

## Recently Identified & Resolved Issues

1. **Admin App Separation from Partner App**:
   - **Symptom / Tech Debt**: The admin dashboard was formerly embedded directly within the partner application, causing monolithic frontend bloat, coupled deployments, cross-role routing entanglements, and potential security boundary blurring.
   - **Resolution**: Extracted the Admin Dashboard into an independent, dedicated React application located at `frontend/admin`. Runs on dev port `5175` (container/production port `3002`) with its own Vite configuration, Nginx container, role-based auth routing (`RequireRole role="admin"`), and CI/CD pipeline steps. Docker compose service `caterconnect-admin-frontend` binds `3002:80`.

2. **HTTPS Redirect on Direct IP (`ERR_CONNECTION_TIMED_OUT`)**:
   - **Symptom**: Accessing the API Gateway or web applications via direct VM IP (e.g., Oracle Cloud VM IP) caused browser `ERR_CONNECTION_TIMED_OUT`.
   - **Root Cause**: Gateway application-layer security check (P1-19) enforced strict HTTPS redirection for all incoming requests (`if (req.headers['x-forwarded-proto'] !== 'https')`). Direct IP and internal network requests typically terminate HTTP without SSL certificates or edge reverse proxy SSL offloading, trapping clients in a timed-out redirect loop.
   - **Resolution**: Updated `backend/gateway/src/index.ts` to bypass HTTPS enforcement for direct IP addresses (IPv4 regex pattern matching `host`) and local development hosts (`localhost`, `127.0.0.1`). HTTPS enforcement remains active for custom production domain hostnames.

3. **Oracle VM Resource Limits & OOM Container Builds**:
   - **Symptom**: Running `docker compose build` directly on the Oracle Cloud free-tier VM (`oracle2`) exhausted low memory/CPU limits, triggering kernel Out-Of-Memory (OOM) kills and hanging build processes.
   - **Resolution**: Shifted image building to GitHub Actions CI/CD runner and local developer machines using `scripts/build-and-push-images.sh`. Prebuilt multi-service container images are tagged and published to Docker Hub (`guruhemanth/caterconnect-*`). Production deployments on the VM pull prebuilt images directly via `docker compose pull && docker compose up -d`.

4. **CI/CD Migrator Execution (`database/migrator.ts`)**:
   - **Symptom**: CI pipeline step for database migration execution failed or required explicit command line arguments, causing inconsistent migration states between environments.
   - **Root Cause**: The migrator script did not default to the `up` action when executed without arguments, and CI runners were invoking ts-node without explicit action flags.
   - **Resolution**: Updated `database/migrator.ts` to default to `up` if no command-line argument is supplied (`process.argv[2] || 'up'`). Aligned `.github/workflows/deploy.yml` and deployment scripts to reliably execute database migrations and support automated audit logging.

5. **Google OAuth Token Validation Configuration**:
   - **Symptom**: Social authentication failed in production environments when tokens issued by Google were rejected or could not be decoded.
   - **Root Cause**: Mismatched or missing OAuth client IDs across the boundary. Backend auth service requires `GOOGLE_CLIENT_ID` for decoding and validating Google ID tokens with `google-auth-library`, while frontend bundles require `VITE_GOOGLE_CLIENT_ID` to initialize the Google Identity Services (`accounts.google.com/gsi/client`) client script.
   - **Resolution**: Configured `GOOGLE_CLIENT_ID` across backend environment templates and `docker-compose.yml`, integrated Google Identity Services SDK script in frontend templates (`index.html`), and configured `VITE_GOOGLE_CLIENT_ID` in frontend environments and modal auth components (`AuthRequiredModal.tsx`).

6. **Oracle VCN Subnet Security Lists (Port 3002 / 5175)**:
   - **Symptom**: External traffic could not reach the newly extracted admin portal on port 3002 even though Docker containers were bound and running.
   - **Resolution / Invariant**: Oracle Cloud Infrastructure (OCI) Virtual Cloud Network (VCN) subnet Security Lists and host `iptables`/`ufw` must explicitly include stateful ingress rules permitting TCP traffic on port `3002` (and gateway port `3000` / customer port `3001`).

7. **Chat Service Thread Upsert Failure (500 Internal Server Error)**:
   - **Symptom**: Opening chat for incoming bookings without existing thread records returned `500 Internal server error`.
   - **Root Cause**: Schema mismatch between `06_chat_schema.sql` (contained `last_message_at`) and the upsert query targeting non-existent `updated_at`.
   - **Resolution**: Added `updated_at timestamptz DEFAULT now()` to `chat_svc.chat_threads` in migration `11_customizations_schema.sql` and updated `backend/services/chat/src/index.ts`.

8. **Custom Combo Package ID Constraint**:
   - **Symptom**: Custom-built combo bookings threw foreign key/not-null constraint errors.
   - **Resolution**: Dropped `NOT NULL` on `order_svc.bookings.package_id`, added `customized_items` jsonb and `custom_combo_name`, and updated SQL queries with `LEFT JOIN` and `COALESCE`.

---

## Architectural & Security Concerns

1. **Header Spoofing Prevention at Gateway**:
   - Downstream microservices rely on `x-user-id` and `x-user-role` headers injected by the API Gateway.
   - **Crucial Invariant**: The API Gateway `onRequest` hook must strip all incoming `x-user-*` and `x-internal-token` headers from external client HTTP requests to prevent privilege escalation attacks.

2. **Reverse Proxy WebSocket Upgrades**:
   - Real-time chat supports WebSockets via `/api/chat/threads/:threadId/ws`.
   - Reverse proxy configuration must explicitly forward `Connection: upgrade` and `Upgrade: websocket` headers. If the connection drops, both customer and partner applications fall back to interval polling every 5 seconds.

3. **Database Connection Pool Exhaustion**:
   - All microservices connect directly to the primary PostgreSQL instance (`caterconnect-postgres`).
   - If traffic spikes, concurrent connection pool limits could be reached. Connection pool size per service is capped at 10, with automated query timeouts set to 15 seconds.

---

## Recommendations for Future Milestones

- **Read Replicas**: As search and discovery traffic increases, route read-heavy caterer discovery queries (`/api/caterers`, `/api/caterers/search`) to a dedicated PostgreSQL read replica to preserve primary DB write throughput.
- **Centralized Event Bus**: Replace direct cross-schema database reads with an event broker (e.g., Redis Streams, RabbitMQ, or NATS) for asynchronous event-driven workflows (e.g., booking confirmations, notification dispatch, settlement triggers).
- **Distributed Caching (Redis)**: Introduce Redis caching layer for frequently accessed, slow-changing catalog data (caterer profiles, standard menu packages, platform settings) and session/token blacklist management to alleviate database load.
