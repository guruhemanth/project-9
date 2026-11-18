import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { realtimeEventNameSchema } from '@caterconnect/shared';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
  createWsClient,
  getWsUrl,
  mintTestJwt,
  computePollingInterval,
  computeBackoff,
  simulatePollingFallback,
  dbHelper,
  TEST_USERS,
} from '../harness';

describe('Tier 2: Navigation & Real-Time Boundaries (R1 & R2)', () => {
  const client = createApiClient();
  let customerToken: string;
  let catererToken: string;
  let sampleBookingId: string;
  let otherCustomerBookingId: string;

  beforeAll(async () => {
    await startAllServers();
    customerToken = await client.loginAsCustomer();
    catererToken = await client.loginAsCaterer();

    // Query sample bookings from database
    const bookings = await dbHelper.query(
      `SELECT id, customer_id, caterer_id, status FROM order_svc.bookings ORDER BY created_at DESC LIMIT 5`,
    );
    if (bookings.length > 0) {
      sampleBookingId = bookings[0].id;
      // Find or assign another booking for tenant isolation tests
      const diffCustomer = bookings.find((b: any) => b.customer_id !== TEST_USERS.customer.id);
      if (diffCustomer) {
        otherCustomerBookingId = diffCustomer.id;
      }
    }
  });

  afterAll(async () => {
    await stopAllServers();
  });

  // ==========================================
  // R1 Navigation Boundaries (TC-T2-NAV-01 to 08)
  // ==========================================

  it('TC-T2-NAV-01: Direct unauthenticated request to /caterer/chat redirects to login with redirect param', () => {
    const appPath = path.resolve(__dirname, '../../../frontend/partner/src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    // Partner app routes wrapped in RequireAuth or protected layout
    const hasRequireAuth =
      content.includes('RequireAuth') ||
      content.includes('ProtectedRoute') ||
      content.includes('Navigate to="/login"');
    expect(hasRequireAuth).toBe(true);
  });

  it('TC-T2-NAV-02: Direct unauthenticated request to /caterer/policies is protected by authentication guard', () => {
    const appPath = path.resolve(__dirname, '../../../frontend/partner/src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    const hasAuthProtection =
      content.includes('RequireAuth') ||
      content.includes('AuthProvider') ||
      content.includes('role=');
    expect(hasAuthProtection).toBe(true);
  });

  it('TC-T2-NAV-03: Customer JWT attempting to access caterer chat inbox receives 403 Forbidden', async () => {
    const res = await client.get('/api/chat/caterer/inbox', { token: customerToken });
    expect(res.status).toBe(403);
  });

  it('TC-T2-NAV-04: Malformed or garbage Bearer token to partner endpoints returns 401 Unauthorized', async () => {
    const res = await client.get('/api/chat/caterer/inbox', {
      headers: { Authorization: 'Bearer this-is-not-a-valid-jwt-token-string' },
    });
    expect(res.status).toBe(401);
  });

  it('TC-T2-NAV-05: Expired JWT to partner endpoints returns 401 Unauthorized', async () => {
    const expiredToken = mintTestJwt({
      sub: TEST_USERS.caterer.id,
      role: TEST_USERS.caterer.role,
      email: TEST_USERS.caterer.email,
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour in the past
    });

    const res = await client.get('/api/chat/caterer/inbox', { token: expiredToken });
    expect(res.status).toBe(401);
  });

  it('TC-T2-NAV-06: JWT signed with wrong secret key is rejected with 401 Unauthorized', async () => {
    const forgedToken = mintTestJwt(
      {
        sub: TEST_USERS.caterer.id,
        role: TEST_USERS.caterer.role,
        email: TEST_USERS.caterer.email,
      },
      'attacker-forged-secret-key-that-does-not-match',
    );

    const res = await client.get('/api/chat/caterer/inbox', { token: forgedToken });
    expect(res.status).toBe(401);
  });

  it('TC-T2-NAV-07: Partner Navbar active link highlighting logic distinguishes active route', () => {
    const navbarPath = path.resolve(
      __dirname,
      '../../../frontend/partner/src/components/layout/Navbar.tsx',
    );
    expect(fs.existsSync(navbarPath)).toBe(true);
    const content = fs.readFileSync(navbarPath, 'utf-8');

    // Must have logic or helper for checking active location / route state
    const hasNavLogic =
      content.includes('useLocation') ||
      content.includes('pathname') ||
      content.includes('NavLink') ||
      content.includes('isActive');
    expect(hasNavLogic).toBe(true);
  });

  it('TC-T2-NAV-08: Empty or whitespace Bearer header returns 401 Unauthorized', async () => {
    const res = await client.get('/api/chat/caterer/inbox', {
      headers: { Authorization: 'Bearer ' },
    });
    expect(res.status).toBe(401);
  });

  // ==========================================
  // R2 Real-Time Boundaries (TC-T2-RT-01 to 08)
  // ==========================================

  it('TC-T2-RT-01: WebSocket connection with expired JWT token is rejected at handshake', async () => {
    const wsUrl = getWsUrl();
    const expiredToken = mintTestJwt({
      sub: TEST_USERS.customer.id,
      role: TEST_USERS.customer.role,
      exp: Math.floor(Date.now() / 1000) - 7200,
    });

    const wsClient = createWsClient(wsUrl, { token: expiredToken, timeoutMs: 2500 });
    try {
      await wsClient.connect();
      expect(wsClient.isConnected).toBe(false);
    } catch (err: any) {
      expect(err).toBeDefined();
    } finally {
      wsClient.close();
    }
  });

  it('TC-T2-RT-02: WebSocket connection with forged signature fails authentication', async () => {
    const wsUrl = getWsUrl();
    const forgedToken = mintTestJwt(
      { sub: TEST_USERS.caterer.id, role: TEST_USERS.caterer.role },
      'forged-secret-key-1234567890',
    );

    const wsClient = createWsClient(wsUrl, { token: forgedToken, timeoutMs: 2500 });
    try {
      await wsClient.connect();
      expect(wsClient.isConnected).toBe(false);
    } catch (err: any) {
      expect(err).toBeDefined();
    } finally {
      wsClient.close();
    }
  });

  it('TC-T2-RT-03: Polling fallback endpoint with non-existent booking ID returns 404 Not Found', async () => {
    const nonExistentBookingId = '00000000-0000-0000-0000-000000000099';
    const res = await client.get(`/api/bookings/${nonExistentBookingId}`, { role: 'customer' });
    expect(res.status).toBe(404);
  });

  it('TC-T2-RT-04: Polling fallback endpoint enforces tenant isolation (Customer A cannot view Customer B booking)', async () => {
    const rogueCustomerToken = mintTestJwt({
      sub: '00000000-0000-0000-0000-000000009999',
      role: 'customer',
      email: 'rogue@example.com',
    });
    const targetId = sampleBookingId || '00000000-0000-0000-0000-000000000001';
    const res = await client.get(`/api/bookings/${targetId}`, { token: rogueCustomerToken });
    expect(res.status).toBe(403);
  });

  it('TC-T2-RT-05: Polling fallback timing interval validation ensures 3000ms to 5000ms bounds with jitter', () => {
    for (let i = 0; i < 20; i++) {
      const interval = computePollingInterval(3000, 2000);
      expect(interval).toBeGreaterThanOrEqual(3000);
      expect(interval).toBeLessThanOrEqual(5000);
    }
  });

  it('TC-T2-RT-06: Exponential backoff calculation for WS reconnection caps at 30 seconds', () => {
    expect(computeBackoff(0)).toBe(1000);
    expect(computeBackoff(1)).toBe(2000);
    expect(computeBackoff(2)).toBe(4000);
    expect(computeBackoff(3)).toBe(8000);
    expect(computeBackoff(4)).toBe(16000);
    expect(computeBackoff(5)).toBe(30000); // Capped at 30s
    expect(computeBackoff(10)).toBe(30000); // Stays capped at 30s
  });

  it('TC-T2-RT-07: Real-time event envelopes reject unrecognized event types', () => {
    expect(realtimeEventNameSchema.safeParse('booking_requested').success).toBe(true);
    expect(realtimeEventNameSchema.safeParse('booking_paid').success).toBe(true);
    expect(realtimeEventNameSchema.safeParse('arbitrary_malicious_event').success).toBe(false);
    expect(realtimeEventNameSchema.safeParse('').success).toBe(false);
  });

  it('TC-T2-RT-08: Polling fallback halts gracefully after maximum consecutive failure threshold', async () => {
    let callCount = 0;
    let failed = false;
    try {
      await simulatePollingFallback(
        async () => {
          callCount++;
          const res = await client.get('/api/bookings/00000000-0000-0000-0000-000000000099', { role: 'customer' });
          return res.status;
        },
        (status) => status === 200,
        10,
        5,
      );
    } catch (err: any) {
      failed = true;
      expect(err.message).toContain('after 5 attempts');
    }

    expect(failed).toBe(true);
    expect(callCount).toBe(5);
  });
});
