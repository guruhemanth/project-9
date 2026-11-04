import { describe, it, expect } from 'vitest';
import type { BookingStatus } from '../src/types/database';

describe('Booking State Machine & Request Flow Rules', () => {
  interface BookingState {
    status: BookingStatus;
    total_amount: number | null;
    commission_pct: number | null;
    commission_amount: number | null;
    caterer_note: string | null;
  }

  function acceptBooking(
    booking: BookingState,
    guestCount: number,
    pricePerPlatePaise: number,
    commPct: number,
    note?: string
  ): BookingState {
    if (booking.status !== 'requested') {
      throw new Error(`Cannot accept booking in ${booking.status} status`);
    }

    const total = guestCount * pricePerPlatePaise;
    const commAmt = Math.round((total * commPct) / 100);

    return {
      status: 'accepted',
      total_amount: total,
      commission_pct: commPct,
      commission_amount: commAmt,
      caterer_note: note || null,
    };
  }

  function rejectBooking(booking: BookingState, note?: string): BookingState {
    if (booking.status !== 'requested') {
      throw new Error(`Cannot reject booking in ${booking.status} status`);
    }

    return {
      ...booking,
      status: 'rejected',
      caterer_note: note || null,
    };
  }

  it('correctly transitions requested -> accepted and computes total & commission in paise', () => {
    const initial: BookingState = {
      status: 'requested',
      total_amount: null,
      commission_pct: null,
      commission_amount: null,
      caterer_note: null,
    };

    // 100 guests at ₹350 (35000 paise), 15% platform commission
    const accepted = acceptBooking(initial, 100, 35000, 15.00, 'Welcome! Booking accepted.');

    expect(accepted.status).toBe('accepted');
    expect(accepted.total_amount).toBe(3500000); // ₹35,000
    expect(accepted.commission_pct).toBe(15.00);
    expect(accepted.commission_amount).toBe(525000); // ₹5,250 platform commission
    expect(accepted.caterer_note).toBe('Welcome! Booking accepted.');
  });

  it('correctly transitions requested -> rejected with caterer note', () => {
    const initial: BookingState = {
      status: 'requested',
      total_amount: 3500000,
      commission_pct: null,
      commission_amount: null,
      caterer_note: null,
    };

    const rejected = rejectBooking(initial, 'Already booked on this date');
    expect(rejected.status).toBe('rejected');
    expect(rejected.caterer_note).toBe('Already booked on this date');
  });

  it('prevents invalid transitions on non-requested bookings', () => {
    const acceptedBooking: BookingState = {
      status: 'accepted',
      total_amount: 3500000,
      commission_pct: 15,
      commission_amount: 525000,
      caterer_note: null,
    };

    // Cannot re-accept or reject an already accepted booking
    expect(() => acceptBooking(acceptedBooking, 100, 35000, 15)).toThrow();
    expect(() => rejectBooking(acceptedBooking)).toThrow();
  });
});
