import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAllowedOrigins } from '@caterconnect/shared';

describe('Feature 3: Admin Dashboard Dedicated Port Separation (Port 5175)', () => {
  const rootDir = path.resolve(__dirname, '../../..');
  const adminRoot = path.join(rootDir, 'frontend/admin');
  const partnerRoot = path.join(rootDir, 'frontend/partner');

  it('TC-R3-01: Admin app defines dedicated package and dev script configured for Port 5175', () => {
    const pkgPath = path.join(adminRoot, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.name).toBe('@caterconnect/admin-app');
    expect(pkg.scripts.dev).toContain('5175');
  });

  it('TC-R3-02: Admin app Vite config proxies /api to API Gateway (:8080) and binds to Port 5175', () => {
    const viteConfigPath = path.join(adminRoot, 'vite.config.ts');
    expect(fs.existsSync(viteConfigPath)).toBe(true);

    const content = fs.readFileSync(viteConfigPath, 'utf-8');
    expect(content).toContain('port: 5175');
    expect(content).toContain('8080');
  });

  it('TC-R3-03: Admin app router defines protected /admin/dashboard with RequireRole roles=["admin"]', () => {
    const appPath = path.join(adminRoot, 'src/App.tsx');
    expect(fs.existsSync(appPath)).toBe(true);

    const content = fs.readFileSync(appPath, 'utf-8');
    expect(content).toContain('path="/admin/dashboard"');
    expect(content).toContain('roles={[\'admin\']}');
  });

  it('TC-R3-04: Admin app Navbar features dedicated Operations Center branding and cross-portal links', () => {
    const navbarPath = path.join(adminRoot, 'src/components/layout/Navbar.tsx');
    expect(fs.existsSync(navbarPath)).toBe(true);

    const content = fs.readFileSync(navbarPath, 'utf-8');
    expect(content).toContain('CaterConnect Admin');
    expect(content).toContain('Operations Center');
    expect(content).toContain('5174'); // Quick link to Partner portal
    expect(content).toContain('5173'); // Quick link to Customer portal
  });

  it('TC-R3-05: Partner app router is purified for caterers and redirects admin paths to Port 5175', () => {
    const partnerAppPath = path.join(partnerRoot, 'src/App.tsx');
    expect(fs.existsSync(partnerAppPath)).toBe(true);

    const content = fs.readFileSync(partnerAppPath, 'utf-8');
    expect(content).toContain('http://localhost:5175/admin/dashboard');
    expect(content).toContain('path="/caterer/dashboard"');
  });

  it('TC-R3-06: Ecosystem startup and shutdown scripts include Port 5175 and launch frontend/admin', () => {
    const startScript = path.join(rootDir, 'scripts/start-all.sh');
    const stopScript = path.join(rootDir, 'scripts/stop-all.sh');

    const startContent = fs.readFileSync(startScript, 'utf-8');
    const stopContent = fs.readFileSync(stopScript, 'utf-8');

    expect(startContent).toContain('5175');
    expect(startContent).toContain('frontend/admin');
    expect(stopContent).toContain('5175');
  });

  it('TC-R3-07: Monorepo workspace configuration registers frontend/admin as an active package', () => {
    const workspacePath = path.join(rootDir, 'pnpm-workspace.yaml');
    const content = fs.readFileSync(workspacePath, 'utf-8');
    expect(content).toContain("'frontend/admin'");
  });

  it('TC-R3-08: Shared CORS environment includes http://localhost:5175 in default dev origins', () => {
    const origins = resolveAllowedOrigins(undefined, true);
    expect(origins).toContain('http://localhost:5175');
  });
});
