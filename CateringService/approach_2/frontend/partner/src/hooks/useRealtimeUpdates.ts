/**
 * useRealtimeUpdates – Partner App
 *
 * Connects to the backend WebSocket at /api/events/ws.
 * On disconnect, falls back to polling /api/bookings/caterer/:id?status=requested
 * every 5 seconds with exponential back-off.
 *
 * Events handled:
 *  - booking_requested  → caterer gets a new incoming request
 *  - booking_accepted   → customer's booking was accepted (echo for admin / caterer view)
 *  - booking_rejected   → booking rejected
 *  - payment_in_progress / payment.paid → booking moved to paid
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export type RealtimeEventType =
  | 'booking_requested'
  | 'booking_accepted'
  | 'booking_rejected'
  | 'payment_in_progress'
  | 'booking_paid';

export interface RealtimeEvent {
  event: RealtimeEventType | string;
  payload: {
    bookingId?: string;
    catererId?: string;
    customerId?: string;
    userId?: string;
    status?: string;
    [key: string]: unknown;
  };
  timestamp?: string;
}

export type RealtimeHandler = (evt: RealtimeEvent) => void;

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

function getWsUrl(): string {
  const apiBase =
    (typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.VITE_API_BASE_URL ||
        (import.meta as any).env.VITE_API_GATEWAY_URL
      : '') || '';

  const proto = apiBase.startsWith('https') ? 'wss' : 'ws';
  const host = apiBase.replace(/^https?:\/\//, '');
  return `${proto}://${host}/api/events/ws`;
}

function getToken(): string | null {
  return localStorage.getItem('caterconnect_token');
}

export function useRealtimeUpdates(
  onEvent: RealtimeHandler,
  _catererId?: string | null,
  pollFallbackUrl?: string | null,
): { connected: boolean } {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEventRef = useRef<RealtimeHandler>(onEvent);
  const [connected, setConnected] = useState(false);

  // Keep handler ref fresh without re-creating the WS
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const visibilityListenerRef = useRef<(() => void) | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (visibilityListenerRef.current && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityListenerRef.current);
      visibilityListenerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current !== null) return; // already running
    if (!pollFallbackUrl) return;

    const token = getToken();

    const poll = async () => {
      // Latency & CPU optimization: pause background network polling when tab is inactive
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      try {
        const res = await fetch(pollFallbackUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();

        // Synthesise a "booking_requested" event for each pending booking
        const bookings: any[] = data.bookings ?? [];
        bookings
          .filter((b: any) => b.status === 'requested')
          .forEach((b: any) => {
            onEventRef.current({
              event: 'booking_requested',
              payload: {
                bookingId: b.id,
                catererId: b.caterer_id,
                customerId: b.customer_id,
                status: 'requested',
              },
            });
          });
      } catch {
        // silent – polling is best-effort
      }
    };

    poll(); // immediate first tick
    pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);

    if (typeof document !== 'undefined') {
      const handleVisibility = () => {
        if (!document.hidden) {
          poll();
        }
      };
      visibilityListenerRef.current = handleVisibility;
      document.addEventListener('visibilitychange', handleVisibility);
    }
  }, [pollFallbackUrl]);

  const connect = useCallback(() => {
    // Clean up any existing socket
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    const token = getToken();
    if (!token) {
      startPolling();
      return;
    }

    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        setConnected(true);
        stopPolling(); // WS is live – no need to poll
      };

      ws.onmessage = (msgEvt) => {
        try {
          const parsed: RealtimeEvent = JSON.parse(msgEvt.data);
          if (parsed.event && parsed.event !== 'connected' && parsed.event !== 'pong') {
            onEventRef.current(parsed);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose, handle there
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Exponential back-off reconnect
        const delay = Math.min(
          BASE_BACKOFF_MS * 2 ** reconnectAttempts.current,
          MAX_BACKOFF_MS,
        );
        reconnectAttempts.current += 1;
        // Fall back to polling immediately while WS is down
        startPolling();
        reconnectTimer.current = setTimeout(connect, delay);
      };
    } catch {
      // WebSocket constructor can throw in some environments
      startPolling();
    }
  }, [startPolling, stopPolling]);

  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
      }
      stopPolling();
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected };
}
