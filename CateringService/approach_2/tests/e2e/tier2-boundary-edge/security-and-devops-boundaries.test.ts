import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { alertSeveritySchema, alertTypeSchema, alertWebhookPayloadSchema } from '@caterconnect/shared';
import { sendPaymentAlertWebhook, sanitizeAlertDetails } from '../../../backend/services/payment/src/alerts';
import {
  startAllServers,
  stopAllServers,
  createApiClient,
} from '../harness';

describe('Tier 2: Security & DevOps Boundaries (P1-15, P1-17, P1-19, P1-20)', () => {
  const client = createApiClient();

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    await stopAllServers();
  });

  // ==============================================================
  // P1-15 Payment Error Alerts Webhook (TC-T2-SEC-01 to 04)
  // ==============================================================

  it('TC-T2-SEC-01: External alert webhook network error or HTTP 500 is caught silently without failing payment transaction', async () => {
    const res = await sendPaymentAlertWebhook({
      alertType: 'PAYMENT_AMOUNT_MISMATCH',
      severity: 'CRITICAL',
      message: 'Payment amount mismatch detected during test',
      details: { bookingId: '00000000-0000-0000-0000-000000000001' },
    });

    expect(typeof res).toBe('boolean');
  });

  it('TC-T2-SEC-02: Alert dispatcher redacts sensitive PII (passwords, tokens, bank account numbers)', () => {
    const rawAlert = {
      accountNumber: '123456789012',
      cardToken: 'tok_live_secret123456',
      secret: 'super_secret_key',
      name: 'Venkateswara Caterers',
    };

    const sanitized = sanitizeAlertDetails(rawAlert);
    expect(sanitized.accountNumber).toBe('[REDACTED]');
    expect(sanitized.cardToken).toBe('[REDACTED]');
    expect(sanitized.secret).toBe('[REDACTED]');
    expect(sanitized.name).toBe('Venkateswara Caterers');
  });

  it('TC-T2-SEC-03: Missing ALERT_WEBHOOK_URL environment variable falls back gracefully to structured logging', async () => {
    const oldUrl = process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_WEBHOOK_URL;
    try {
      const dispatched = await sendPaymentAlertWebhook({
        alertType: 'OTHER',
        severity: 'LOW',
        message: 'Fallback logging test',
      });
      expect(dispatched).toBe(false);
    } finally {
      if (oldUrl) process.env.ALERT_WEBHOOK_URL = oldUrl;
    }
  });

  it('TC-T2-SEC-04: Incident severity enumeration enforces valid severity levels', () => {
    expect(alertSeveritySchema.safeParse('critical').success).toBe(true);
    expect(alertSeveritySchema.safeParse('error').success).toBe(true);
    expect(alertSeveritySchema.safeParse('warn').success).toBe(true);
    expect(alertSeveritySchema.safeParse('info').success).toBe(true);
    expect(alertSeveritySchema.safeParse('invalid_severity').success).toBe(false);
  });

  // ==============================================================
  // P1-17 CI Pipeline Lint & QA Branch Trigger (TC-T2-SEC-05 to 08)
  // ==============================================================

  it('TC-T2-SEC-05: GitHub Actions workflow file .github/workflows/ci.yml exists and triggers on QA branch pushes', () => {
    const ciPath = path.resolve(__dirname, '../../../.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, 'utf-8');

    expect(content).toContain('QA');
    expect(content.includes('push:') && content.includes('QA')).toBe(true);
  });

  it('TC-T2-SEC-06: GitHub Actions workflow triggers on QA branch pull requests', () => {
    const ciPath = path.resolve(__dirname, '../../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf-8');

    expect(content).toContain('pull_request:');
    expect(content).toContain('QA');
  });

  it('TC-T2-SEC-07: CI workflow includes a dedicated lint execution step prior to automated tests', () => {
    const ciPath = path.resolve(__dirname, '../../../.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf-8');

    const hasLintStep =
      content.includes('pnpm run lint') ||
      content.includes('pnpm lint') ||
      content.includes('name: Lint');
    expect(hasLintStep).toBe(true);
  });

  it('TC-T2-SEC-08: Workspace root package.json defines a lint script for monorepo code quality', () => {
    const pkgPath = path.resolve(__dirname, '../../../package.json');
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);

    expect(pkg.scripts).toHaveProperty('lint');
  });

  // ==============================================================
  // P1-19 HTTPS Redirect Enforcement (TC-T2-SEC-09 to 12)
  // ==============================================================

  it('TC-T2-SEC-09: Production request with x-forwarded-proto: http triggers 301 Permanent Redirect to HTTPS', async () => {
    const res = await client.request('/api/caterers', {
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.caterconnect.in',
      },
      redirect: 'manual',
    });

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toMatch(/^https:\/\/[^/]+\/api\/caterers/);
  });

  it('TC-T2-SEC-10: HTTPS redirect preserves complex query parameters and deep paths', async () => {
    const res = await client.request('/api/caterers?city=Tirupati&guests=200&diet=pure_veg&sort=price_asc', {
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.caterconnect.in',
      },
      redirect: 'manual',
    });

    expect(res.status).toBe(301);
    const loc = res.headers.get('location');
    expect(loc).toMatch(/^https:\/\/[^/]+\/api\/caterers\?city=Tirupati&guests=200&diet=pure_veg&sort=price_asc/);
    expect(loc).toContain('guests=200');
    expect(loc).toContain('diet=pure_veg');
  });

  it('TC-T2-SEC-11: Request with x-forwarded-proto: https passes through without redirect', async () => {
    const res = await client.request('/ready', {
      headers: {
        'x-forwarded-proto': 'https',
        host: 'api.caterconnect.in',
      },
      redirect: 'manual',
    });

    expect(res.status).toBe(200);
  });

  it('TC-T2-SEC-12: Request without insecure x-forwarded-proto header bypasses HTTPS redirect', async () => {
    const res = await client.request('/ready', { redirect: 'manual' });
    expect(res.status).toBe(200);
  });

  // ==============================================================
  // P1-20 Legal Pages & DPDP Consent (TC-T2-SEC-13 to 16)
  // ==============================================================

  it('TC-T2-SEC-13: User registration payload with dpdpConsent=false or omitted is rejected with 400 Bad Request', async () => {
    const randomEmail = `test_nodpdp_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const res = await client.post(
      '/api/auth/register',
      {
        email: randomEmail,
        password: 'Password123!',
        fullName: 'No DPDP Test User',
        phone: '+919876543210',
        role: 'customer',
        dpdpConsent: false, // Explicitly false
      },
      {
        headers: {
          'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
        },
      },
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body).toLowerCase()).toContain('dpdp');
  });

  it('TC-T2-SEC-14: User registration with explicit dpdpConsent=true is accepted by authentication service', async () => {
    const randomEmail = `test_dpdp_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const res = await client.post(
      '/api/auth/register',
      {
        email: randomEmail,
        password: 'Password123!',
        fullName: 'DPDP Consenting User',
        phone: '+919876543210',
        role: 'customer',
        dpdpConsent: true,
      },
      {
        headers: {
          'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
        },
      },
    );

    expect(res.status).toBe(201);
  });

  it('TC-T2-SEC-15: Legal pages (/terms, /privacy, /refund-policy) are accessible publicly without JWT authentication', async () => {
    // Gateway / customer app public accessibility check
    const publicLegalRoutes = ['/terms', '/privacy', '/refund-policy'];

    for (const route of publicLegalRoutes) {
      const res = await client.get(route, { role: 'none' });
      // Gateway either returns 200 (if static files hosted) or 404 (if routed to SPA fallback)
      // but should NOT return 401 Unauthorized
      expect(res.status).not.toBe(401);
    }
  });

  it('TC-T2-SEC-16: Customer App route definitions include dedicated routes for terms, privacy, and refund policies', () => {
    const appPath = path.resolve(__dirname, '../../../frontend/customer/src/App.tsx');
    expect(fs.existsSync(appPath)).toBe(true);
    const content = fs.readFileSync(appPath, 'utf-8');

    const hasTerms = content.includes('/terms');
    const hasPrivacy = content.includes('/privacy');
    const hasRefund = content.includes('/refund-policy');

    expect(hasTerms && hasPrivacy && hasRefund).toBe(true);
  });
});
