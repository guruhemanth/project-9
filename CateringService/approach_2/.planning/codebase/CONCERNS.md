# CaterConnect Technical Debt, Known Issues & Architectural Concerns

## Recently Identified & Resolved Bugs
1. **Chat Service Thread Upsert Failure (Internal Server Error 500)**:
   - **Symptom**: When a caterer clicked to open chat on an incoming booking that did not yet have a record in `chat_svc.chat_threads`, `GET /api/chat/threads/booking/:bookingId` returned `500 Internal server error`.
   - **Root Cause**: The query executed `INSERT INTO chat_svc.chat_threads ... ON CONFLICT (booking_id) DO UPDATE SET updated_at = NOW()`. The table schema defined in `06_chat_schema.sql` only contained `last_message_at` and `created_at`; `updated_at` did not exist in the database, causing PostgreSQL error `42703 (undefined_column)`.
   - **Resolution**: Added `updated_at timestamptz DEFAULT now()` to `chat_svc.chat_threads` via database migration `11_customizations_schema.sql` and updated `backend/services/chat/src/index.ts` to target `last_message_at`. Verified with HTTP 200/201 across all chat endpoints.
2. **Custom Combo Package ID Constraint**:
   - **Symptom**: Bookings created for custom-built combos without a fixed package threw constraint violations.
   - **Resolution**: Dropped `NOT NULL` on `order_svc.bookings.package_id` and added `customized_items` jsonb and `custom_combo_name`. Updated all SQL queries to use `LEFT JOIN caterer_svc.packages p` with `COALESCE(p.name, b.custom_combo_name, 'Custom Feast Combo')`.

## Architectural & Security Concerns
1. **Header Spoofing Prevention at Gateway**:
   - Downstream microservices rely on `x-user-id` and `x-user-role` headers passed by the API Gateway.
   - **Crucial Invariant**: The API Gateway `onRequest` hook must strip all incoming `x-user-*` and `x-internal-token` headers from client HTTP requests to prevent privilege escalation attacks.
2. **Reverse Proxy WebSocket Upgrades**:
   - Real-time chat supports WebSockets via `/api/chat/threads/:threadId/ws`.
   - Reverse proxy configuration must explicitly forward `Connection: upgrade` and `Upgrade: websocket` headers. If the connection fails, both customer and partner apps cleanly fall back to interval polling every 5 seconds.
3. **Database Connection Pool Exhaustion**:
   - Currently, all 6 microservices connect directly to the single PostgreSQL instance (`caterconnect-postgres`).
   - If container traffic spikes, concurrent connection pool limits could be reached. Connection pool size per service is capped at 10, with automated query timeouts set to 15 seconds.

## Recommendations for Future Milestones
- **Read Replicas**: As search traffic increases, move read-heavy caterer discovery queries (`/api/caterers`) to a dedicated read replica.
- **Centralized Event Bus**: Replace direct cross-schema database reads with an event broker (e.g. Redis Streams or RabbitMQ) for asynchronous notification dispatch.
