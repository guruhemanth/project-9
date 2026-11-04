import type { BookingStatus, UserRole } from './types';
export declare const ALLOWED_BOOKING_TRANSITIONS: Record<BookingStatus, {
    to: BookingStatus;
    allowedActors: (UserRole | 'webhook' | 'system')[];
}[]>;
export declare function canTransitionBooking(from: BookingStatus, to: BookingStatus, actor: UserRole | 'webhook' | 'system'): boolean;
export declare function calculateCancellationRefund(totalPaise: number, cancelledBy: UserRole, eventDateStr: string, currentDateStr?: string): number;
//# sourceMappingURL=state-machine.d.ts.map