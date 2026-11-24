/**
 * Currency and format helpers for CaterConnect (Pan-India)
 * Non-negotiable rule: Money is stored as integer paise, never floats.
 * Display in INR with Intl.NumberFormat.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrWithDecimalsFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format paise to formatted INR string (e.g. 35000 paise -> ₹350)
 */
export function formatPaiseToINR(paise: number, showDecimals = false): string {
  const rupees = paise / 100;
  return showDecimals
    ? inrWithDecimalsFormatter.format(rupees)
    : inrFormatter.format(rupees);
}

/**
 * Convert rupees to integer paise
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Format date in Asia/Kolkata timezone
 */
export function formatIndianDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
