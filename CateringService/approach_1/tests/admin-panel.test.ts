import { describe, it, expect } from 'vitest';
import type { CatererStatus } from '../src/types/database';

describe('Admin Panel Business Rules & Transitions', () => {
  const allowedTransitions: Record<CatererStatus, CatererStatus[]> = {
    pending: ['approved', 'rejected'],
    approved: ['suspended'],
    rejected: ['pending'],
    suspended: ['approved'],
  };

  function canTransition(from: CatererStatus, to: CatererStatus): boolean {
    return allowedTransitions[from]?.includes(to) ?? false;
  }

  it('allows valid caterer verification transitions', () => {
    // Admin approving pending caterer
    expect(canTransition('pending', 'approved')).toBe(true);
    // Admin rejecting pending caterer
    expect(canTransition('pending', 'rejected')).toBe(true);
    // Admin suspending approved caterer
    expect(canTransition('approved', 'suspended')).toBe(true);
    // Re-activating suspended caterer
    expect(canTransition('suspended', 'approved')).toBe(true);
  });

  it('prohibits invalid caterer status transitions', () => {
    // Cannot suspend a caterer who is still pending
    expect(canTransition('pending', 'suspended')).toBe(false);
    // Cannot directly approve a rejected caterer without pending resubmission
    expect(canTransition('rejected', 'approved')).toBe(false);
  });

  it('requires rejection reason when rejecting a caterer', () => {
    const validateRejection = (status: CatererStatus, reason?: string) => {
      if (status === 'rejected' && (!reason || reason.trim().length === 0)) {
        throw new Error('Rejection reason is required');
      }
      return true;
    };

    expect(() => validateRejection('rejected', '')).toThrow();
    expect(() => validateRejection('rejected', '   ')).toThrow();
    expect(validateRejection('rejected', 'FSSAI Certificate number mismatch')).toBe(true);
    expect(validateRejection('approved')).toBe(true);
  });

  it('validates platform commission bounds between 0 and 100', () => {
    const isValidCommission = (pct: number) => pct >= 0 && pct <= 100;

    expect(isValidCommission(15.00)).toBe(true);
    expect(isValidCommission(0)).toBe(true);
    expect(isValidCommission(100)).toBe(true);
    expect(isValidCommission(-5)).toBe(false);
    expect(isValidCommission(105)).toBe(false);
  });
});
