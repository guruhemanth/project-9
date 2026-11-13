# CaterConnect Testing Architecture & Standards

## Test Framework
- **Vitest (v3.2.7)**: Fast, ESM-native testing framework used across services, gateway, and shared libraries.
- **Node Test Runner / TSX**: Used for live end-to-end operational flow verification scripts (`scripts/verify-local-flow.ts`).

## Test File Organization
- Tests are colocated in `tests/` directories within each respective workspace:
  - `backend/services/chat/tests/`: Authorization verification, thread participant controls, inbox queries.
  - `backend/services/booking-order/tests/`: Status machine state transitions, customer identification data integrity.
  - `backend/services/caterer-menu/tests/`: Menu item CRUD, min/max guest threshold enforcement.
  - `backend/services/payment/tests/`: Advance vs balance split math, commission calculation precision.
  - `shared/tests/`: JWT internal token HMAC signing and validation.

## Test Structure & Patterns
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildChatServer } from '../src/index';

describe('Chat Service Authorization & Thread Management', () => {
  let server: any;

  beforeAll(async () => {
    server = buildChatServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('rejects unauthorized access when x-user-id header is missing', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/chat/caterer/inbox',
    });
    expect(res.statusCode).toBe(401);
  });
});
```

## Security & Authorization Hole Verification
- Explicit tests verify that customers cannot access caterer inboxes, and caterers cannot access bookings or threads belonging to other caterers.
- Any new endpoint must include test cases verifying:
  1. Unauthenticated request rejection (`401`).
  2. Wrong-role request rejection (`403`).
  3. Valid authorized request success (`200` / `201`).

## Running Tests
- Run all tests across workspace: `pnpm test`
- Run service specific tests: `cd backend/services/chat && pnpm test`
- Run end-to-end customer-caterer verification: `npx tsx scripts/verify-local-flow.ts`
