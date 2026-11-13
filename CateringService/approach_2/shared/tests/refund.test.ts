import { describe, it, expect } from 'vitest';
import { calculateCancellationRefund } from '../src/state-machine';

describe('Phase 3 Cancellation Refund Calculation Rules & Timestamps', () => {
  const totalPaise = 3500000; // ₹35,000

  it('provides 100% refund if cancelled by customer 7 or more days prior to event', () => {
    const eventDate = '2026-12-15T10:00:00.000Z';
    const cancelDate = '2026-12-07T10:00:00.000Z'; // 8 days before
    const refund = calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate);
    expect(refund).toBe(3500000);
    expect(Number.isInteger(refund)).toBe(true);
  });

  it('provides 100% refund exactly at the 7-day boundary', () => {
    const eventDate = '2026-12-15T18:00:00.000Z';
    const cancelDate = '2026-12-08T18:00:00.000Z'; // exactly 7 days before
    const refund = calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate);
    expect(refund).toBe(3500000);
  });

  it('provides 50% refund if cancelled between 3 and 7 days prior to event', () => {
    const eventDate = '2026-12-15T18:00:00.000Z';
    const cancelDate = '2026-12-11T18:00:00.000Z'; // 4 days before
    const refund = calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate);
    expect(refund).toBe(1750000); // 50% of ₹35,000 = ₹17,500
    expect(Number.isInteger(refund)).toBe(true);
  });

  it('provides 50% refund at exactly the 3-day boundary', () => {
    const eventDate = '2026-12-15T18:00:00.000Z';
    const cancelDate = '2026-12-12T18:00:00.000Z'; // exactly 3 days before
    const refund = calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate);
    expect(refund).toBe(1750000);
  });

  it('provides 0% refund if cancelled less than 3 days prior to event', () => {
    const eventDate = '2026-12-15T18:00:00.000Z';
    const cancelDate = '2026-12-13T18:00:00.000Z'; // 2 days before
    const refund = calculateCancellationRefund(totalPaise, 'customer', eventDate, cancelDate);
    expect(refund).toBe(0);
  });

  it('provides 100% refund if cancelled by caterer regardless of timeframe', () => {
    const eventDate = '2026-12-15T18:00:00.000Z';
    const cancelDate = '2026-12-15T10:00:00.000Z'; // 8 hours before event
    const refund = calculateCancellationRefund(totalPaise, 'caterer', eventDate, cancelDate);
    expect(refund).toBe(3500000);
  });

  it('provides 100% refund for admin / force majeure cancellation regardless of timeframe', () => {
    const eventDate = '2026-12-15T18:00:00.000Z';
    const cancelDate = '2026-12-15T17:00:00.000Z'; // 1 hour before event
    const refund = calculateCancellationRefund(totalPaise, 'admin', eventDate, cancelDate);
    expect(refund).toBe(3500000);
  });

  it('ensures odd paise amounts round half up to exact integer paise without floats', () => {
    const oddPaise = 100001; // ₹1,000.01
    const eventDate = '2026-12-15T18:00:00.000Z';
    const cancelDate = '2026-12-11T18:00:00.000Z'; // 4 days before (50%)
    const refund = calculateCancellationRefund(oddPaise, 'customer', eventDate, cancelDate);
    expect(refund).toBe(50001); // Math.round(100001 * 0.5) = 50000.5 -> 50001
    expect(Number.isInteger(refund)).toBe(true);
  });
});
