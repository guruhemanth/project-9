import { apiFetch } from '@/lib/api-client';
import type {
  PlatformAnalytics,
  AdminCaterer,
  CatererSettlement,
  Booking,
  OpsNodesResponse,
  OpsLogsResponse,
  ContainerInfo,
} from '@caterconnect/shared';

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

export async function adminIssueRefund(
  bookingId: string,
  refundAmountPaise: number,
  reason: string,
  notes?: string
): Promise<{ success: boolean; booking: any; refundId: string; refundAmountPaise: number; totalRefundAmountPaise: number }> {
  return apiFetch(`/api/admin/bookings/${bookingId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ refundAmountPaise, reason, notes }),
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

export async function updateCatererCommission(
  catererId: string,
  commissionPct: number
): Promise<{ caterer: any }> {
  return apiFetch(`/api/caterers/${catererId}`, {
    method: 'PATCH',
    body: JSON.stringify({ commissionPct }),
  });
}

// System Ops & Node Health Endpoints
export async function fetchOpsNodesMetrics(): Promise<OpsNodesResponse> {
  return apiFetch<OpsNodesResponse>('/api/admin/ops/nodes');
}

export async function fetchOpsContainers(): Promise<{ containers: ContainerInfo[]; source: string }> {
  return apiFetch<{ containers: ContainerInfo[]; source: string }>('/api/admin/ops/containers');
}

export async function fetchOpsLogs(
  container: string,
  tail = 100,
  filter?: string
): Promise<OpsLogsResponse> {
  const params = new URLSearchParams({
    container,
    tail: String(tail),
  });
  if (filter) params.append('filter', filter);
  return apiFetch<OpsLogsResponse>(`/api/admin/ops/logs?${params.toString()}`);
}
