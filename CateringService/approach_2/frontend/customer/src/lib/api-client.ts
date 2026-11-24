const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env.VITE_API_BASE_URL || (import.meta as any).env.VITE_API_GATEWAY_URL
    : '') || '';

export { API_BASE_URL };

export interface ApiErrorOptions {
  code?: string;
  cause?: string;
  retryAfter?: number;
  details?: unknown;
  endpoint?: string;
}

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public causeDescription?: string;
  public retryAfter?: number;
  public isSessionError: boolean;
  public isRateLimit: boolean;
  public details?: unknown;
  public endpoint?: string;

  constructor(message: string, status: number, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code;
    this.causeDescription = options.cause;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
    this.endpoint = options.endpoint;

    this.isSessionError =
      status === 401 ||
      options.code === 'SESSION_EXPIRED' ||
      (status === 403 &&
        (options.code === 'SESSION_EXPIRED' || message.toLowerCase().includes('expired')));
    this.isRateLimit = status === 429;
  }
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('caterconnect_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // 1. Rate Limit Error Handling (HTTP 429)
    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After');
      const retryAfter =
        data.retryAfter ||
        (retryHeader ? parseInt(retryHeader, 10) : undefined) ||
        (typeof data.message === 'string' && data.message.match(/(\d+)\s*sec/i)
          ? parseInt(RegExp.$1, 10)
          : undefined);

      const cause =
        data.cause ||
        (endpoint.includes('/api/auth')
          ? 'Too many login or registration attempts'
          : 'Too many API requests sent in a short timeframe');

      // Construct a clear, user-friendly, and meaningful error string
      const meaningfulMessage =
        data.message ||
        `Rate limit reached: ${cause}. Please wait ${
          retryAfter ? `${retryAfter} seconds` : 'a moment'
        } before trying again.`;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('caterconnect:rate-limit-error', {
            detail: {
              message: meaningfulMessage,
              cause,
              retryAfter: retryAfter || 60,
              endpoint,
            },
          })
        );
      }

      throw new ApiError(meaningfulMessage, 429, {
        code: data.code || 'RATE_LIMIT_EXCEEDED',
        cause,
        retryAfter,
        details: data.details,
        endpoint,
      });
    }

    // 2. Session & Authentication Error Handling (HTTP 401 / Session Expired)
    const isAuthLoginOrRegister =
      endpoint.includes('/api/auth/login') ||
      endpoint.includes('/api/auth/register') ||
      endpoint.includes('/api/auth/google');

    const isSessionExpired =
      (response.status === 401 || data.code === 'SESSION_EXPIRED') &&
      !isAuthLoginOrRegister;

    if (isSessionExpired) {
      const sessionMessage =
        data.message || 'Your session has expired. Please sign in again to continue.';

      if (typeof window !== 'undefined') {
        localStorage.removeItem('caterconnect_token');
        sessionStorage.setItem('caterconnect_session_expired', sessionMessage);
        window.dispatchEvent(
          new CustomEvent('caterconnect:session-expired', {
            detail: {
              message: sessionMessage,
              code: data.code || 'SESSION_EXPIRED',
              endpoint,
            },
          })
        );
      }

      throw new ApiError(sessionMessage, response.status, {
        code: data.code || 'SESSION_EXPIRED',
        cause: 'Session expired or invalidated',
        details: data.details,
        endpoint,
      });
    }

    // 3. Other Generic API Errors
    const fallbackMessage =
      data.message ||
      data.error ||
      (typeof data === 'string' ? data : `HTTP ${response.status}: Request failed`);

    throw new ApiError(fallbackMessage, response.status, {
      code: data.code,
      cause: data.cause,
      details: data.details,
      endpoint,
    });
  }

  return data as T;
}
