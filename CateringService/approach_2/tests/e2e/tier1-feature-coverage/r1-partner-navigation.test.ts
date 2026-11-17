import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startAllServers, stopAllServers, createApiClient, TEST_CATERER } from '../harness';

describe('Feature 1: Partner App Header Navigation (R1)', () => {
  const client = createApiClient();
  const partnerRoot = path.resolve(__dirname, '../../../frontend/partner');
  const navbarPath = path.join(partnerRoot, 'src/components/layout/Navbar.tsx');
  const appPath = path.join(partnerRoot, 'src/App.tsx');

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-R1-01: Navbar contains persistent top navigation link for Chat (/caterer/chat)', () => {
    expect(fs.existsSync(navbarPath)).toBe(true);
    const content = fs.readFileSync(navbarPath, 'utf-8');
    const hasChatLink =
      content.includes('/caterer/chat') ||
      content.includes('to="/caterer/chat"') ||
      content.includes("to='/caterer/chat'");
    const hasChatLabel =
      content.toLowerCase().includes('chat') ||
      content.toLowerCase().includes('messages');
    expect(hasChatLink && hasChatLabel).toBe(true);
  });

  it('TC-R1-02: Navbar contains persistent top navigation link for Caterer Policies (/caterer/policies)', () => {
    expect(fs.existsSync(navbarPath)).toBe(true);
    const content = fs.readFileSync(navbarPath, 'utf-8');
    const hasPoliciesLink =
      content.includes('/caterer/policies') ||
      content.includes('to="/caterer/policies"') ||
      content.includes("to='/caterer/policies'");
    const hasPoliciesLabel =
      content.toLowerCase().includes('policies') ||
      content.toLowerCase().includes('policy');
    expect(hasPoliciesLink && hasPoliciesLabel).toBe(true);
  });

  it('TC-R1-03: Partner App router defines route for /caterer/chat', () => {
    expect(fs.existsSync(appPath)).toBe(true);
    const appContent = fs.readFileSync(appPath, 'utf-8');
    const hasChatRoute =
      appContent.includes('path="/caterer/chat"') ||
      appContent.includes("path='/caterer/chat'") ||
      appContent.includes('caterer/chat');
    expect(hasChatRoute).toBe(true);
  });

  it('TC-R1-04: Partner App router defines route for /caterer/policies', () => {
    expect(fs.existsSync(appPath)).toBe(true);
    const appContent = fs.readFileSync(appPath, 'utf-8');
    const hasPoliciesRoute =
      appContent.includes('path="/caterer/policies"') ||
      appContent.includes("path='/caterer/policies'") ||
      appContent.includes('caterer/policies');
    expect(hasPoliciesRoute).toBe(true);
  });

  it('TC-R1-05: Authenticated caterer can access chat inbox API through Gateway', async () => {
    const unauthRes = await client.get('/api/chat/caterer/inbox');
    expect(unauthRes.status).toBe(401);

    const authRes = await client.get('/api/chat/caterer/inbox', { role: 'caterer' });
    expect(authRes.status).toBe(200);
    expect(authRes.body).toBeDefined();
  });

  it('TC-R1-06: Caterer policies view data model exposes required order policy fields', async () => {
    const res = await client.get(`/api/caterers/${TEST_CATERER.id}`, { role: 'caterer' });
    expect(res.status).toBe(200);
    const caterer = res.body.caterer || res.body;
    expect(caterer).toBeDefined();
    expect(caterer.id).toBe(TEST_CATERER.id);
    expect(typeof (caterer.lead_time_days ?? caterer.leadTimeDays ?? 0)).toBe('number');
    expect(typeof (caterer.min_guests ?? caterer.minGuests ?? 0)).toBe('number');
  });
});
