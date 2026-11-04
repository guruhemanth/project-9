import { describe, it, expect } from 'vitest';
import { formatPaiseToINR, rupeesToPaise } from '../src/lib/formatters';
import fs from 'fs';
import path from 'path';

describe('Formatters & Indian Currency Rules', () => {
  it('converts and displays paise in INR correctly', () => {
    expect(rupeesToPaise(350)).toBe(35000);
    expect(rupeesToPaise(1250.5)).toBe(125050);

    const formatted = formatPaiseToINR(35000);
    // en-IN format should contain ₹ and 350
    expect(formatted).toContain('350');
    expect(formatted).toMatch(/₹|INR/);
  });
});

describe('Database Schema & RLS SQL Integrity', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261103000000_init_schema.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  it('contains RLS enable commands on all tables', () => {
    const expectedTables = [
      'profiles',
      'caterers',
      'caterer_documents',
      'packages',
      'package_items',
      'addons',
      'platform_settings',
      'bookings',
      'booking_addons',
      'booking_status_history',
      'payments',
      'reviews',
    ];

    expectedTables.forEach((table) => {
      expect(migrationSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    });
  });

  it('contains security definer role helpers with search_path set', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.current_role()');
    expect(migrationSql).toContain('SECURITY DEFINER');
    expect(migrationSql).toContain('SET search_path = public');
  });

  it('contains required booking state machine RPC functions', () => {
    expect(migrationSql).toContain('FUNCTION public.accept_booking');
    expect(migrationSql).toContain('FUNCTION public.reject_booking');
    expect(migrationSql).toContain('FUNCTION public.cancel_booking');
    expect(migrationSql).toContain('FUNCTION public.complete_booking');
    expect(migrationSql).toContain('FUNCTION public.expire_stale_bookings');
  });

  it('enforces cancellation refund logic per SPEC.md', () => {
    // 100% for >= 7 days
    expect(migrationSql).toContain('v_days_left >= 7');
    // 50% for >= 3 days
    expect(migrationSql).toContain('v_days_left >= 3');
    // 100% if cancelled by caterer
    expect(migrationSql).toContain("v_actor_role = 'caterer'");
  });
});
