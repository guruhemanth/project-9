import { apiFetch } from '@/lib/api-client';

export async function fetchPendingCaterers() {
  return apiFetch<{ caterers: any[] }>('/api/caterers?all=true');
}

export async function updateCatererStatus(catererId: string, status: string) {
  return apiFetch<{ caterer: any }>(`/api/caterers/${catererId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateCommissionPct(_pct: number): Promise<boolean> {
  return true;
}
