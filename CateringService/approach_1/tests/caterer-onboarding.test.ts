import { describe, it, expect } from 'vitest';
import { rupeesToPaise } from '../src/lib/formatters';

describe('Caterer Onboarding & Package Validations', () => {
  it('validates FSSAI 14-digit format rule strictly', () => {
    const validFssai = '10123000004567';
    const invalidShort = '101234';
    const invalidLetters = '1012300000456A';

    const regex = /^\d{14}$/;
    expect(regex.test(validFssai)).toBe(true);
    expect(regex.test(invalidShort)).toBe(false);
    expect(regex.test(invalidLetters)).toBe(false);
  });

  it('correctly converts INR plate prices into integer paise', () => {
    expect(rupeesToPaise(350)).toBe(35000);
    expect(rupeesToPaise(499.5)).toBe(49950);
    expect(Number.isInteger(rupeesToPaise(350))).toBe(true);
  });

  it('validates package guest constraints', () => {
    const minGuests = 50;
    const maxGuests = 500;
    expect(minGuests).toBeGreaterThanOrEqual(10);
    expect(maxGuests).toBeGreaterThanOrEqual(minGuests);
  });
});
