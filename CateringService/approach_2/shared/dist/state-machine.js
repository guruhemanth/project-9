export const ALLOWED_BOOKING_TRANSITIONS = {
    requested: [
        { to: 'accepted', allowedActors: ['caterer', 'admin'] },
        { to: 'rejected', allowedActors: ['caterer', 'admin'] },
        { to: 'cancelled', allowedActors: ['customer', 'admin'] },
        { to: 'expired', allowedActors: ['system'] },
    ],
    accepted: [
        { to: 'paid', allowedActors: ['webhook', 'admin'] },
        { to: 'cancelled', allowedActors: ['customer', 'caterer', 'admin'] },
        { to: 'expired', allowedActors: ['system'] },
    ],
    paid: [
        { to: 'completed', allowedActors: ['caterer', 'admin'] },
        { to: 'cancelled', allowedActors: ['customer', 'caterer', 'admin'] },
    ],
    completed: [],
    rejected: [],
    cancelled: [],
    expired: [],
};
export function canTransitionBooking(from, to, actor) {
    const allowedList = ALLOWED_BOOKING_TRANSITIONS[from];
    if (!allowedList)
        return false;
    const match = allowedList.find((item) => item.to === to);
    return match ? match.allowedActors.includes(actor) : false;
}
export function calculateCancellationRefund(totalPaise, cancelledBy, eventDateStr, currentDateStr = new Date().toISOString()) {
    if (cancelledBy === 'caterer' || cancelledBy === 'admin') {
        return totalPaise; // 100% refund if cancelled by caterer
    }
    const eventDate = new Date(eventDateStr);
    const currentDate = new Date(currentDateStr);
    const diffTime = eventDate.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays >= 7) {
        return totalPaise; // 100% refund
    }
    else if (diffDays >= 3) {
        return Math.round(totalPaise * 0.5); // 50% refund
    }
    else {
        return 0; // 0% refund under 3 days
    }
}
