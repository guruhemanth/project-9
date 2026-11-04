import { apiFetch } from '@/lib/api-client';

export async function loginApi(credentials: { email: string; password: string }) {
  return apiFetch<{ user: any; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function registerApi(data: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: 'customer' | 'caterer';
}) {
  return apiFetch<{ user: any; token: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function googleAuthApi(idToken: string) {
  return apiFetch<{ user: any; token: string; refreshToken?: string }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}
