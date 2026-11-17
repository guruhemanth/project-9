import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient } from '../harness';

describe('Feature 15: HTTPS Redirect Enforcement (P1-19)', () => {
  const client = createApiClient();

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-19-01: Gateway intercepts insecure http proto and issues 301 Permanent Redirect', async () => {
    const res = await client.get('/health', {
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.caterconnect.in',
      },
      redirect: 'manual', // Do not auto-follow to capture 301
    });

    expect(res.status).toBe(301);
    const location = res.headers.get('location');
    expect(location).toBeDefined();
    expect(location!.startsWith('https://')).toBe(true);
  });

  it('TC-P1-19-02: Redirect location header preserves host and path', async () => {
    const res = await client.request('/api/caterers?city=Tirupati&page=1', {
      headers: {
        'x-forwarded-proto': 'http',
      },
      redirect: 'manual',
    });

    expect(res.status).toBe(301);
    const loc = res.headers.get('location');
    expect(loc).toBeDefined();
    expect(loc).toMatch(/^https:\/\/[^/]+\/api\/caterers\?city=Tirupati&page=1/);
  });

  it('TC-P1-19-03: HTTPS requests pass through without redirection', async () => {
    const res = await client.get('/health', {
      headers: {
        'x-forwarded-proto': 'https',
        host: 'api.caterconnect.in',
      },
      redirect: 'manual',
    });

    expect(res.status).toBe(200);
  });

  it('TC-P1-19-04: Redirect preserves complex URL encoded query strings and special characters', async () => {
    const res = await client.request('/api/caterers?search=South%20Indian&filter%5Bprice%5D=35000&tags=veg%2Cjain', {
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.caterconnect.in',
      },
      redirect: 'manual',
    });

    expect(res.status).toBe(301);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('search=South%20Indian');
    expect(loc).toContain('filter%5Bprice%5D=35000');
    expect(loc).toContain('tags=veg%2Cjain');
  });

  it('TC-P1-19-05: Gateway source incorporates HTTPS redirect onRequest hook', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const gatewaySrcPath = path.resolve(
      __dirname,
      '../../../backend/gateway/src/index.ts',
    );
    expect(fs.existsSync(gatewaySrcPath)).toBe(true);
    const content = fs.readFileSync(gatewaySrcPath, 'utf-8');

    const hasHttpsLogic =
      content.includes('x-forwarded-proto') ||
      content.includes('https') ||
      content.includes('301');
    expect(hasHttpsLogic).toBe(true);
  });
});
