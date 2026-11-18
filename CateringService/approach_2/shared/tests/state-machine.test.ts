import { describe, it, expect } from 'vitest';
import {
  ALLOWED_BOOKING_TRANSITIONS,
  canTransitionBooking,
  calculateCancellationRefund,
} from '../src/state-machine';
import type { BookingStatus, UserRole } from '../src/types';

describe('P0-15: Exhaustive 49-Transition Booking State Machine Cartesian Matrix', () => {
  const allStatuses: BookingStatus[] = [
    'requested',
    'accepted',
    'paid',
    'completed',
    'rejected',
    'cancelled',
    'expired',
  ];

  const allActors: (UserRole | 'webhook' | 'system')[] = [
    'customer',
    'caterer',
    'admin',
    'webhook',
    'system',
  ];

  it('runs exhaustive 49-transition x 5-actor matrix verification (245 test cases)', () => {
    let testedCount = 0;
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        for (const actor of allActors) {
          testedCount++;
          const isAllowed = canTransitionBooking(from, to, actor);
          const transitions = ALLOWED_BOOKING_TRANSITIONS[from] || [];
          const matched = transitions.find((t) => t.to === to);
          const expected = matched ? matched.allowedActors.includes(actor) : false;

          expect(
            isAllowed,
            `Expected transition from '${from}' to '${to}' by actor '${actor}' to be ${expected}`
          ).toBe(expected);
        }
      }
    }
    expect(testedCount).toBe(7 * 7 * 5); // 245 cases
  });

  describe('Explicit transition assertions', () => {
    it('allows valid transitions for authorized actors', () => {
      // requested -> accepted: caterer, admin
      expect(canTransitionBooking('requested', 'accepted', 'caterer')).toBe(true);
      expect(canTransitionBooking('requested', 'accepted', 'admin')).toBe(true);

      // requested -> rejected: caterer, admin
      expect(canTransitionBooking('requested', 'rejected', 'caterer')).toBe(true);
      expect(canTransitionBooking('requested', 'rejected', 'admin')).toBe(true);

      // requested -> cancelled: customer, admin
      expect(canTransitionBooking('requested', 'cancelled', 'customer')).toBe(true);
      expect(canTransitionBooking('requested', 'cancelled', 'admin')).toBe(true);

      // requested -> expired: system
      expect(canTransitionBooking('requested', 'expired', 'system')).toBe(true);

      // accepted -> paid: webhook, admin
      expect(canTransitionBooking('accepted', 'paid', 'webhook')).toBe(true);
      expect(canTransitionBooking('accepted', 'paid', 'admin')).toBe(true);

      // accepted -> cancelled: customer, caterer, admin
      expect(canTransitionBooking('accepted', 'cancelled', 'customer')).toBe(true);
      expect(canTransitionBooking('accepted', 'cancelled', 'caterer')).toBe(true);
      expect(canTransitionBooking('accepted', 'cancelled', 'admin')).toBe(true);

      // accepted -> expired: system
      expect(canTransitionBooking('accepted', 'expired', 'system')).toBe(true);

      // paid -> completed: caterer, admin
      expect(canTransitionBooking('paid', 'completed', 'caterer')).toBe(true);
      expect(canTransitionBooking('paid', 'completed', 'admin')).toBe(true);

      // paid -> cancelled: customer, caterer, admin
      expect(canTransitionBooking('paid', 'cancelled', 'customer')).toBe(true);
      expect(canTransitionBooking('paid', 'cancelled', 'caterer')).toBe(true);
      expect(canTransitionBooking('paid', 'cancelled', 'admin')).toBe(true);
    });

    it('rejects disallowed transitions and unauthorized actors', () => {
      // Customer cannot accept or reject requested booking
      expect(canTransitionBooking('requested', 'accepted', 'customer')).toBe(false);
      expect(canTransitionBooking('requested', 'rejected', 'customer')).toBe(false);

      // Customer or caterer cannot mark booking paid (must be webhook or admin)
      expect(canTransitionBooking('accepted', 'paid', 'customer')).toBe(false);
      expect(canTransitionBooking('accepted', 'paid', 'caterer')).toBe(false);

      // Customer cannot mark booking completed
      expect(canTransitionBooking('paid', 'completed', 'customer')).toBe(false);

      // Terminal states cannot transition to anything
      const terminalStates: BookingStatus[] = ['completed', 'rejected', 'cancelled', 'expired'];
      for (const terminal of terminalStates) {
        for (const target of allStatuses) {
          for (const actor of allActors) {
            expect(
              canTransitionBooking(terminal, target, actor),
              `Terminal state ${terminal} should not transition to ${target} by ${actor}`
            ).toBe(false);
          }
        }
      }

      // Self-transitions are never allowed
      for (const status of allStatuses) {
        for (const actor of allActors) {
          expect(canTransitionBooking(status, status, actor)).toBe(false);
        }
      }
    });
  });

  describe('P0-19: Cancellation refund rules', () => {
    const totalPaise = 100000; // ₹1,000

    it('refunds 100% when cancelled by caterer or admin regardless of timing', () => {
      const eventDate = '2026-12-25T18:00:00Z';
      const cancelDate = '2026-12-25T12:00:00Z'; // same day
      expect(calculateCancellationRefund(totalPaise, 'caterer', eventDate, cancelDate)).toBe(totalPaise);
      expect(calculateCancellationRefund(totalPaise, 'admin', eventDate, cancelDate)).toBe(totalPaise);
    });

    it('refunds 100% when customer cancels >= 7 days before event', () => {
      const eventDate = '2026-12-25T18:00:00Z';
      const cancelDate = '2026-12-18T18:00:00Z'; // 7 days prior
      expect(calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate)).toBe(totalPaise);
    });

    it('refunds 50% when customer cancels between 3 and 7 days before event', () => {
      const eventDate = '2026-12-25T18:00:00Z';
      const cancelDate = '2026-12-21T18:00:00Z'; // 4 days prior
      expect(calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate)).toBe(50000);
    });

    it('refunds 0% when customer cancels < 3 days before event', () => {
      const eventDate = '2026-12-25T18:00:00Z';
      const cancelDate = '2026-12-23T18:00:00Z'; // 2 days prior
      expect(calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate)).toBe(0);
    });
  });
});
