# CaterConnect Code Conventions & Quality Standards

## 1. Naming & Monorepo Architecture Patterns
- **Monorepo Structure**: Managed via `pnpm` workspace with dedicated packages:
  - `shared`: `@caterconnect/shared` providing cross-cutting Zod schemas, environment validators (`env.ts`), internal auth token signers/verifiers (`internal-auth.ts`), CORS builders (`cors.ts`), error definitions (`errors.ts`), and formatters (`formatters.ts`).
  - `backend/gateway`: API Gateway reverse proxy on Port 8080.
  - `backend/services/*`: Domain microservices (`auth`, `caterer-menu`, `booking-order`, `payment`, `notification`, `chat`).
  - `frontend/customer`: Vite + React 19 customer PWA (Port 5173).
  - `frontend/partner`: Vite + React 19 caterer partner portal (Port 5174).
  - `frontend/admin`: Vite + React 19 platform operations portal (Port 5175).
  - `tests/e2e`: Dedicated comprehensive End-to-End and integration test suite.
- **React Components**: `PascalCase` with `.tsx` extension (e.g., `PartnerChatHub.tsx`, `CustomComboBuilderModal.tsx`, `Navbar.tsx`).
- **TypeScript Functions & Variables**: `camelCase` (e.g., `fetchCatererBookings`, `formatPaiseToINR`, `signInternalToken`).
- **Database Tables & Columns**: `snake_case` (e.g., `total_amount_paise`, `advance_amount_paise`, `custom_combo_name`, `chat_svc.chat_threads`).
- **Database Schemas**: Logical microservice domain suffix `_svc` (`auth_svc`, `caterer_svc`, `order_svc`, `pay_svc`, `notify_svc`, `chat_svc`).

## 2. TypeScript & Strict Typing Rules
- **Strict Mode**: `tsconfig.json` enforces TypeScript strict mode (`"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`) across all workspace packages.
- **Zero Untyped Any**: No `any` types permitted unless accompanied by an explicit inline comment explaining technical necessity (e.g., legacy mock injection).
- **Zod Contract Validation**: All boundary inputs (HTTP request bodies, query params, WebSocket payloads, and environment variables) must be parsed through `@caterconnect/shared` Zod schemas (`src/schemas.ts`).

## 3. Financial & Monetary Representation Standards
- **Integer Paise Precision**: All monetary values across database columns, API request/response payloads, and service calculations are stored strictly as integer **paise** (1 INR = 100 paise).
  - **No Floating-Point Math**: Floating-point representations (`float`, `double`, `number` with decimals) are prohibited for financial calculations to prevent IEEE 754 precision and rounding discrepancies.
  - Examples: `total_amount_paise`, `advance_amount_paise`, `balance_amount_paise`, `commission_paise`.
- **Display Formatting**: Monetary display in UIs must use `formatPaiseToINR(paiseAmount)` from `@caterconnect/shared` or `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` to guarantee proper Indian numbering formatting (`₹1,25,000`).

## 4. Role Isolation & Authentication Security
- **Strict Role Hierarchy**: Roles are strictly categorized into `customer`, `caterer`, and `admin`.
- **Server-Derived Identity**: Roles and identities are stored in `auth_svc.users` and derived strictly in backend microservices from verified JWTs. Roles supplied in client payloads or unverified headers are **never trusted**.
- **Internal Microservice Token Exchange**: The API Gateway validates incoming user JWTs, strips client-supplied `x-user-id`, `x-user-role`, and `x-user-email` headers, and mints an HMAC-signed internal token via `signInternalToken()`. Downstream microservices verify this signature using `verifyInternalToken()`.
- **Zero-Secret Client Rule**: Client frontend bundles (`customer`, `partner`, `admin`) must NEVER contain secrets.
  - Permitted in client: Public URLs, Gateway host, Razorpay Key ID (public test/live key), and public feature flags.
  - Strictly forbidden in client: Service role keys, database connection strings, JWT signing secrets (`JWT_SECRET`), internal HMAC secrets (`INTERNAL_AUTH_SECRET`), Razorpay webhook secrets (`RAZORPAY_WEBHOOK_SECRET`), and SMS/Email API provider keys.
- **Port Separation**:
  - Customer App binds to Port `5173`.
  - Partner App binds to Port `5174`.
  - Admin App binds to dedicated Port `5175`. Cross-navigation between Partner and Admin portals is strictly separated via port redirects and role verification.

## 5. Security & Infrastructure Hardening Standards
- **SAST & Vulnerability Scanning**:
  - **Semgrep SAST**: Codebase scanning for OWASP Top 10 vulnerabilities, TypeScript/JavaScript security anti-patterns, and injection risks.
  - **Trivy Filesystem CVE & Secret Scanning**: Deep container and filesystem scans for vulnerable packages and committed credentials or tokens.
  - **pnpm audit**: Automated dependency vulnerability gate running in CI (`pnpm audit`).
- **Fastify Security Headers**: Every microservice and API Gateway registers `@fastify/helmet` to inject industry-standard security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- **CORS Allowlists**: Managed dynamically via `buildCorsOptions()` and `resolveAllowedOrigins()` in `@caterconnect/shared`. Only recognized origin ports (`localhost:5173`, `localhost:5174`, `localhost:5175`, `localhost:3000`, `localhost:3001`, `localhost:3002`, and verified production domains) are permitted.
- **Rate Limiting**:
  - Configured via `@fastify/rate-limit` on the API Gateway.
  - General API requests: 100 requests per minute per IP.
  - Sensitive authentication endpoints (`/api/auth/login`, `/api/auth/register`): Stricter rate limit of **10 requests per minute** to protect against brute-force and credential stuffing attacks.
- **IP-Aware HTTPS Enforcement**: In production environments, requests with `x-forwarded-proto: http` are issued an automatic `301 Moved Permanently` redirect to `https://`.
- **Sensitive Log Redaction**: Fastify Pino loggers use `loggerRedactionConfig` from `@caterconnect/shared` to automatically redact `password`, `token`, `phone`, `card`, `secret`, `authorization`, and bank credentials.

## 6. Error Handling & API Response Envelope
- **Centralized Error Handler**: Every service and the API Gateway registers `registerCentralizedErrorHandler(server, serviceName)`.
- **Standardized Error Envelope**:
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Human-readable description",
    "details": []
  }
  ```
- **HTTP Status Codes**:
  - `400`: `ValidationError` with details array or DPDP consent failure.
  - `401`: `Unauthorized: Authentication required`.
  - `403`: `Forbidden: Access denied` (insufficient role or tenancy mismatch).
  - `404`: `Resource not found`.
  - `429`: `RATE_LIMIT_EXCEEDED` (with `retryAfter` metadata).
  - `500`: `Internal server error` (internal details masked from client, logged via Pino).
