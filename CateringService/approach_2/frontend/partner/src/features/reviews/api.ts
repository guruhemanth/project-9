import { apiFetch } from '@/lib/api-client';

export async function submitReview(payload: { bookingId: string; rating: number; comment?: string }) {
  return apiFetch('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
