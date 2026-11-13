import { apiFetch } from '@/lib/api-client';

export async function fetchCurrentCaterer() {
  return apiFetch<{ caterer: any; packages: any[]; menuItems: any[] }>('/api/caterers/me');
}

export async function fetchCatererByOwner(ownerId: string) {
  return apiFetch<{ caterer: any; packages: any[]; menuItems: any[] }>(`/api/caterers/by-owner/${ownerId}`);
}

export async function submitCatererOnboarding(data: any) {
  return apiFetch<{ message: string; caterer: any }>('/api/caterers/onboard', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchCatererBookings(catererId: string) {
  return apiFetch<{ bookings: any[] }>(`/api/bookings/caterer/${catererId}`);
}

export async function acceptBooking(bookingId: string, catererNote?: string) {
  return apiFetch<{ booking: any }>(`/api/bookings/${bookingId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ catererNote }),
  });
}

export async function rejectBooking(bookingId: string, reason?: string) {
  return apiFetch<{ booking: any }>(`/api/bookings/${bookingId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function createMenuPackage(catererId: string, packageData: any) {
  return apiFetch<{ package: any }>(`/api/caterers/${catererId}/packages`, {
    method: 'POST',
    body: JSON.stringify(packageData),
  });
}

export async function fetchCatererAvailability(catererId: string, month?: string) {
  const q = month ? `?month=${month}` : '';
  return apiFetch<{ unavailableDates: any[] }>(`/api/caterers/${catererId}/availability${q}`);
}

export async function addBlackoutDate(catererId: string, date: string, reason?: string) {
  return apiFetch<{ blackoutDate: any }>(`/api/caterers/${catererId}/blackout-dates`, {
    method: 'POST',
    body: JSON.stringify({ date, reason }),
  });
}

export async function removeBlackoutDate(catererId: string, date: string) {
  return apiFetch<{ success: boolean }>(`/api/caterers/${catererId}/blackout-dates/${date}`, {
    method: 'DELETE',
  });
}
