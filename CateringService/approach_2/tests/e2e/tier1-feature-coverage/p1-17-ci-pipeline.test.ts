import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Feature 14: CI Pipeline Lint Step & QA Trigger (P1-17)', () => {
  // Dynamically resolve repository root finding .github/workflows/ci.yml
  let currentDir = __dirname;
  let ciWorkflowPath = '';
  while (currentDir !== path.dirname(currentDir)) {
    const candidate = path.join(currentDir, '.github/workflows/ci.yml');
    if (fs.existsSync(candidate)) {
      ciWorkflowPath = candidate;
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  const pkgJsonPath = path.resolve(__dirname, '../../../package.json');

  it('TC-P1-17-01: GitHub Actions CI workflow file exists in repository', () => {
    expect(fs.existsSync(ciWorkflowPath)).toBe(true);
  });

  it('TC-P1-17-02: CI workflow triggers on push events to QA branch', () => {
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');
    const onPushMatch = content.match(/push:\s*\n\s*branches:\s*\[([^\]]+)\]/);
    expect(onPushMatch).not.toBeNull();
    const branches = onPushMatch![1];
    expect(branches.includes('QA') || branches.includes("'QA'")).toBe(true);
  });

  it('TC-P1-17-03: CI workflow triggers on pull_request events to QA branch', () => {
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');
    const onPrMatch = content.match(/pull_request:\s*\n\s*branches:\s*\[([^\]]+)\]/);
    expect(onPrMatch).not.toBeNull();
    const branches = onPrMatch![1];
    expect(branches.includes('QA') || branches.includes("'QA'")).toBe(true);
  });

  it('TC-P1-17-04: CI workflow includes dedicated Lint step', () => {
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');
    const hasLintStep =
      content.toLowerCase().includes('lint') &&
      (content.includes('pnpm run lint') || content.includes('pnpm -r run lint') || content.includes('eslint') || content.includes('Lint'));
    expect(hasLintStep).toBe(true);
  });

  it('TC-P1-17-05: Root package.json defines typecheck or lint scripts for workspace verification', () => {
    expect(fs.existsSync(pkgJsonPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const scripts = pkg.scripts || {};
    const hasVerificationScript = Boolean(scripts.lint || scripts.typecheck);
    expect(hasVerificationScript).toBe(true);
  });

  it('TC-P1-17-06: CI workflow executes serialized test suites and security audit', () => {
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');
    expect(content).toContain('--workspace-concurrency=1');
    expect(content).toContain('pnpm audit');
  });
});
