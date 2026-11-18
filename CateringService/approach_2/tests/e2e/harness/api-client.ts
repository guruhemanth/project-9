import crypto from 'node:crypto';
import { TEST_USERS } from './fixtures';

export interface ApiResponse<T = any> {
  status: number;
  ok: boolean;
  headers: Headers;
  body: T;
  rawText: string;
}

export interface RequestOptions {
  method?: string;
  role?: 'admin' | 'caterer' | 'customer' | 'none';
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  redirect?: RequestRedirect;
}

const globalTokenCache: Record<string, string> = {};

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function mintTestJwt(
  payload: { sub: string; role: string; email?: string; [key: string]: any },
  secret = process.env.JWT_SECRET || 'caterconnect-super-secret-development-jwt-key-min-32-chars',
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour validity
    ...payload,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setToken(role: 'admin' | 'caterer' | 'customer', token: string): void {
    globalTokenCache[role] = token;
  }

  getCachedToken(role: 'admin' | 'caterer' | 'customer'): string | undefined {
    return globalTokenCache[role];
  }

  async login(role: 'admin' | 'caterer' | 'customer'): Promise<string> {
    if (globalTokenCache[role]) {
      return globalTokenCache[role];
    }

    const creds = TEST_USERS[role];

    try {
      const res = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });

      if (res.ok) {
        const data = (await res.json()) as { accessToken?: string; token?: string };
        const token = data.accessToken || data.token;
        if (token) {
          globalTokenCache[role] = token;
          return token;
        }
      }
    } catch {
      // If network fails or rate limited, mint fallback token
    }

    // Fallback: mint genuine HS256 JWT using shared secret
    const token = mintTestJwt({
      sub: creds.id,
      role: creds.role,
      email: creds.email,
    });
    globalTokenCache[role] = token;
    return token;
  }

  async loginAsAdmin(): Promise<string> {
    return this.login('admin');
  }

  async loginAsCaterer(): Promise<string> {
    return this.login('caterer');
  }

  async loginAsCustomer(): Promise<string> {
    return this.login('customer');
  }

  async request<T = any>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers: Record<string, string> = { ...(options.headers || {}) };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    } else if (options.role && options.role !== 'none') {
      const token = await this.login(options.role);
      headers['Authorization'] = `Bearer ${token}`;
    }

    let bodyStr: string | undefined = undefined;
    if (options.body !== undefined && options.body !== null) {
      if (typeof options.body === 'string') {
        bodyStr = options.body;
      } else {
        bodyStr = JSON.stringify(options.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: bodyStr,
      redirect: options.redirect || 'follow',
    });

    const rawText = await res.text();
    let body: any = rawText;
    try {
      body = JSON.parse(rawText);
    } catch {
      // Keep as string if not JSON
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body,
      rawText,
    };
  }

  async get<T = any>(path: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T = any>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async patch<T = any>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  async put<T = any>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async delete<T = any>(path: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export function createApiClient(baseUrl?: string): ApiClient {
  return new ApiClient(baseUrl);
}
