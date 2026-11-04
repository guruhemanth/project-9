/**
 * Indian currency & date helpers.
 * Rule: Money is always handled in integer paise, never floating point.
 */
const inrFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
});
export function formatPaiseToINR(paise) {
    const rupees = paise / 100;
    return inrFormatter.format(rupees);
}
export function rupeesToPaise(rupees) {
    return Math.round(rupees * 100);
}
export function formatIndianDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(date);
}
