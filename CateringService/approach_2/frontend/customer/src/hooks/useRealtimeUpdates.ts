/**
 * useRealtimeUpdates – Customer App
 *
 * Connects to the backend WebSocket at /api/events/ws.
 * Falls back to polling /api/bookings/customer every 5 seconds
 * with exponential back-off on reconnect.
 *
 * Events handled:
 *  - booking_accepted   → caterer accepted the customer's booking
 *  - booking_rejected   → caterer declined
 *  - payment_in_progress / payment.paid → payment confirmed
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
  pollFallbackUrl?: string | null,
): { connected: boolean } {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEventRef = useRef<RealtimeHandler>(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current !== null) return;
    if (!pollFallbackUrl) return;

    const token = getToken();

    const poll = async () => {
      try {
        const res = await fetch(pollFallbackUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();

        // Emit synthetic events for accepted bookings (action needed)
        const bookings: any[] = data.bookings ?? [];
        bookings
          .filter((b: any) => b.status === 'accepted')
          .forEach((b: any) => {
            onEventRef.current({
              event: 'booking_accepted',
              payload: {
                bookingId: b.id,
                catererId: b.caterer_id,
                customerId: b.customer_id,
                status: 'accepted',
              },
            });
          });

        bookings
          .filter((b: any) => b.status === 'paid')
          .forEach((b: any) => {
            onEventRef.current({
              event: 'booking_paid',
              payload: {
                bookingId: b.id,
                catererId: b.caterer_id,
                customerId: b.customer_id,
                status: 'paid',
              },
            });
          });
      } catch {
        // silent – polling is best-effort
      }
    };

    poll();
    pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [pollFallbackUrl]);

  const connect = useCallback(() => {
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
        stopPolling();
      };

      ws.onmessage = (msgEvt) => {
        try {
          const parsed: RealtimeEvent = JSON.parse(msgEvt.data);
          if (parsed.event && parsed.event !== 'connected' && parsed.event !== 'pong') {
            onEventRef.current(parsed);
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        const delay = Math.min(
          BASE_BACKOFF_MS * 2 ** reconnectAttempts.current,
          MAX_BACKOFF_MS,
        );
        reconnectAttempts.current += 1;
        startPolling();
        reconnectTimer.current = setTimeout(connect, delay);
      };
    } catch {
      startPolling();
    }
  }, [startPolling, stopPolling]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current !== null) clearTimeout(reconnectTimer.current);
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
