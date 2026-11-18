import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildAuthServer } from '../src';
import { pgPool } from '../src/db';

describe('Google Authentication (Customers Only) (Test-First)', () => {
  const app = buildAuthServer();

  beforeAll(async () => {
    await app.ready();
    // Seed an existing caterer and admin for role restriction tests
    await pgPool.query(
      `INSERT INTO auth_svc.users (id, email, password_hash, role, full_name, phone)
       VALUES ('a0000000-0000-0000-0000-000000000001', 'partner.caterer@caterconnect.in', 'hash', 'caterer', 'Caterer Owner', '+919876543210')
       ON CONFLICT (email) DO NOTHING`
    );
    await pgPool.query(
      `INSERT INTO auth_svc.users (id, email, password_hash, role, full_name, phone)
       VALUES ('a0000000-0000-0000-0000-000000000002', 'admin.platform@caterconnect.in', 'hash', 'admin', 'Platform Admin', '+919876543211')
       ON CONFLICT (email) DO NOTHING`
    );
  });

  afterAll(async () => {
    await app.close();
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  it('rejects POST /api/auth/google with missing idToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it('prohibits caterers from signing in with Google (403 Forbidden)', async () => {
    // Attempt Google login using the caterer's email
    const mockToken = JSON.stringify({
      sub: 'google_caterer_12345',
      email: 'partner.caterer@caterconnect.in',
      name: 'Caterer Owner',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: mockToken },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('customer');
  });

  it('prohibits admins from signing in with Google (403 Forbidden)', async () => {
    // Attempt Google login using the admin's email
    const mockToken = JSON.stringify({
      sub: 'google_admin_12345',
      email: 'admin.platform@caterconnect.in',
      name: 'Platform Admin',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: mockToken },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('customer');
  });

  it('provisions a new customer account when signing in with Google', async () => {
    const uniqueEmail = `google.customer.${Date.now()}@gmail.com`;
    const mockToken = JSON.stringify({
      sub: `google_sub_${Date.now()}`,
      email: uniqueEmail,
      name: 'Sita Raman',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: mockToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.email).toBe(uniqueEmail);
    expect(body.user.role).toBe('customer');
    expect(body.user.fullName).toBe('Sita Raman');

    // Verify token can be decoded by Fastify JWT
    const decoded = app.jwt.verify(body.token) as any;
    expect(decoded.sub).toBe(body.user.id);
    expect(decoded.role).toBe('customer');

    // Verify database record
    const dbRes = await pgPool.query('SELECT * FROM auth_svc.users WHERE email = $1', [uniqueEmail]);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].role).toBe('customer');
    expect(dbRes.rows[0].is_verified).toBe(true);
  });

  it('authenticates an existing customer when signing in with Google', async () => {
    const existingEmail = `google.existing.${Date.now()}@gmail.com`;
    const googleSub = `google_sub_existing_${Date.now()}`;
    const mockToken = JSON.stringify({
      sub: googleSub,
      email: existingEmail,
      name: 'Gopal Reddy',
    });

    // 1. First sign-in creates the customer
    const firstRes = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: mockToken },
    });
    expect(firstRes.statusCode).toBe(200);
    const userId = firstRes.json().user.id;

    // 2. Second sign-in logs them in
    const secondRes = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: mockToken },
    });
    expect(secondRes.statusCode).toBe(200);
    const secondBody = secondRes.json();
    expect(secondBody.user.id).toBe(userId);
    expect(secondBody.user.role).toBe('customer');
    expect(secondBody.token).toBeDefined();
  });

  it('rejects password login for accounts created with Google that have no password hash', async () => {
    const googleOnlyEmail = `google.only.${Date.now()}@gmail.com`;
    const mockToken = JSON.stringify({
      sub: `google_only_${Date.now()}`,
      email: googleOnlyEmail,
      name: 'Google Only User',
    });

    const gRes = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: mockToken },
    });
    expect(gRes.statusCode).toBe(200);

    // Attempt password login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: googleOnlyEmail,
        password: 'anyPassword123!',
      },
    });
    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().error).toContain('Invalid email or password');
  });
});
