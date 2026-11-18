# CaterConnect Code Conventions & Quality Standards

## Naming Patterns
- **React Components**: `PascalCase` with `.tsx` extension (e.g., `PartnerChatHub.tsx`, `CustomComboBuilderModal.tsx`).
- **TypeScript Functions & Variables**: `camelCase` (e.g., `fetchCatererBookings`, `formatPaiseToINR`).
- **Database Tables & Columns**: `snake_case` (e.g., `total_amount_paise`, `custom_combo_name`, `chat_svc.chat_threads`).
- **Database Schemas**: Domain suffix `_svc` (e.g., `caterer_svc`, `order_svc`, `chat_svc`, `pay_svc`).

## Financial & Currency Conventions
- **Paise Precision**: All monetary values in the database, API payloads, and internal business logic are represented as integer amounts in **paise** (1 INR = 100 paise) to eliminate IEEE 754 floating-point rounding errors.
- **Display Formatting**: Always use `formatPaiseToINR(paiseAmount)` from `lib/formatters.ts` to render currency symbols (`₹`) with Indian numbering formatting (`1,25,000`).

## Error Handling
- **API Responses**: Always return consistent JSON payloads with an `error` key and appropriate HTTP status codes:
  - `400`: `ValidationError` with details array
  - `401`: `Unauthorized: Authentication required`
  - `403`: `Forbidden: Access denied`
  - `404`: `Resource not found`
  - `500`: `Internal server error` (with detailed internal error logged via Pino)
- **Fastify Centralized Error Handler**: Registered on every service via `registerCentralizedErrorHandler(server, serviceName)`.
- **Frontend Fallbacks**: Never leave the user on a hanging loading spinner. Wrap API calls in `try/catch/finally` and surface alert banners.

## Logging Standards
- Use Fastify's built-in `pino` instance via `req.log` or `server.log`.
- Redact sensitive keys: `password`, `token`, `phone`, `card`, `secret`.
- Never use unformatted `console.log` in production microservice endpoints.

## Authentication & Authorization
- Every microservice route that requires user context must invoke `getAuthenticatedUser(req)`.
- Roles must be checked explicitly: `customer`, `caterer`, or `admin`.
- Caterer routes must verify business ownership (`WHERE owner_id = user.userId`) to enforce multi-tenant security boundaries.
