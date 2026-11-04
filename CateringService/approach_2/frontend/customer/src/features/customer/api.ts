import { apiFetch } from '@/lib/api-client';

export async function fetchCaterers(filters?: { cuisine?: string; city?: string }) {
  const params = new URLSearchParams();
  if (filters?.cuisine) params.append('cuisine', filters.cuisine);
  if (filters?.city) params.append('city', filters.city);
  const q = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<{ caterers: any[] }>(`/api/caterers${q}`);
}

export async function fetchCatererDetail(id: string) {
  return apiFetch<{ caterer: any }>(`/api/caterers/${id}`);
}

export async function createBookingRequest(payload: any) {
  return apiFetch<{ booking: any }>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCustomerBookings() {
  return apiFetch<{ bookings: any[] }>('/api/bookings/customer');
}

export async function cancelBooking(bookingId: string, reason: string) {
  return apiFetch<{ booking: any; refundAmountPaise: number }>(`/api/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
