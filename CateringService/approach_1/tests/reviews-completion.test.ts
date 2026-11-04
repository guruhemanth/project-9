import { describe, it, expect } from 'vitest';

describe('Review Submission & Event Completion Business Rules', () => {
  it('enforces event completion only on or after event date', () => {
    const canComplete = (eventDateStr: string, currentDateStr: string) => {
      const eventDate = new Date(eventDateStr);
      const currentDate = new Date(currentDateStr);
      return currentDate >= eventDate;
    };

    expect(canComplete('2026-10-15', '2026-11-03')).toBe(true);
    expect(canComplete('2026-11-03', '2026-11-03')).toBe(true);
    expect(canComplete('2026-11-20', '2026-11-03')).toBe(false);
  });

  it('validates 1-5 star ratings', () => {
    const isValidRating = (r: number) => Number.isInteger(r) && r >= 1 && r <= 5;
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
  });

  it('correctly calculates cumulative average ratings', () => {
    const reviews = [{ rating: 5 }, { rating: 4 }, { rating: 5 }, { rating: 5 }];
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const avg = Number((sum / reviews.length).toFixed(2));
    expect(avg).toBe(4.75);
    expect(reviews.length).toBe(4);
  });
});
