import { apiFetch } from '@/lib/api-client';
import type { PlatformAnalytics, AdminCaterer, CatererSettlement, Booking } from '@caterconnect/shared';

export async function fetchAdminAnalytics(): Promise<{ analytics: PlatformAnalytics }> {
  return apiFetch<{ analytics: PlatformAnalytics }>('/api/admin/analytics');
}

export async function fetchAdminCaterers(status?: string): Promise<{ caterers: AdminCaterer[] }> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<{ caterers: AdminCaterer[] }>(`/api/admin/caterers${query}`);
}

export async function updateCatererStatus(
  catererId: string,
  status: string,
  rejectionReason?: string
): Promise<{ success: boolean; caterer: any }> {
  return apiFetch<{ success: boolean; caterer: any }>(`/api/admin/caterers/${catererId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, rejectionReason }),
  });
}

export async function fetchAdminBookings(status?: string): Promise<{ bookings: (Booking & {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  catererBusinessName?: string;
  packageName?: string;
})[] }> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch(`/api/admin/bookings${query}`);
}

export async function adminCancelBooking(
  bookingId: string,
  reason: string
): Promise<{ success: boolean; booking: any; refundAmountPaise: number }> {
  return apiFetch(`/api/admin/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function fetchAdminSettlements(status?: string): Promise<{
  settlements: (CatererSettlement & {
    catererBusinessName?: string;
    eventDate?: string;
    guestCount?: number;
  })[];
}> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch(`/api/admin/settlements${query}`);
}

export async function disburseSettlement(
  settlementId: string,
  utrReference: string
): Promise<{ success: boolean; settlement: CatererSettlement }> {
  return apiFetch(`/api/admin/settlements/${settlementId}/disburse`, {
    method: 'POST',
    body: JSON.stringify({ utrReference }),
  });
}

export async function updateCommissionPct(_pct: number): Promise<boolean> {
  return true;
}
