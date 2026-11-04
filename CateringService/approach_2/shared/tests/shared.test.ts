import { describe, it, expect } from 'vitest';
import {
  rupeesToPaise,
  formatPaiseToINR,
  catererOnboardingSchema,
  canTransitionBooking,
  calculateCancellationRefund,
} from '../src';

describe('Shared Package Unit Tests', () => {
  it('handles Indian currency in integer paise', () => {
    expect(rupeesToPaise(350)).toBe(35000);
    expect(rupeesToPaise(1250.5)).toBe(125050);
    expect(formatPaiseToINR(35000)).toMatch(/350/);
  });

  it('validates 14-digit FSSAI numbers with Zod', () => {
    const valid = {
      businessName: 'Tirupati Royal Caterers',
      city: 'Tirupati',
      serviceAreas: ['Alipiri', 'MR Palli'],
      cuisines: ['andhra'],
      fssaiNumber: '10123000004567',
    };
    expect(() => catererOnboardingSchema.parse(valid)).not.toThrow();

    const invalid = { ...valid, fssaiNumber: '123' };
    expect(() => catererOnboardingSchema.parse(invalid)).toThrow();
  });

  it('enforces booking state machine transitions', () => {
    // Caterer can accept a requested booking
    expect(canTransitionBooking('requested', 'accepted', 'caterer')).toBe(true);
    // Customer cannot directly mark booking accepted
    expect(canTransitionBooking('requested', 'accepted', 'customer')).toBe(false);
    // Only webhook/admin can move accepted -> paid
    expect(canTransitionBooking('accepted', 'paid', 'webhook')).toBe(true);
    expect(canTransitionBooking('accepted', 'paid', 'customer')).toBe(false);
  });

  it('calculates tiered cancellation refunds per policy', () => {
    const totalPaise = 100000; // Rs 1,000

    // Caterer cancels -> 100% refund
    expect(calculateCancellationRefund(totalPaise, 'caterer', '2026-11-20', '2026-11-19')).toBe(totalPaise);

    // Customer cancels >= 7 days before event -> 100%
    expect(calculateCancellationRefund(totalPaise, 'customer', '2026-11-20', '2026-11-10')).toBe(totalPaise);

    // Customer cancels 3-7 days before event -> 50%
    expect(calculateCancellationRefund(totalPaise, 'customer', '2026-11-20', '2026-11-15')).toBe(50000);

    // Customer cancels < 3 days before event -> 0%
    expect(calculateCancellationRefund(totalPaise, 'customer', '2026-11-20', '2026-11-19')).toBe(0);
  });
});
