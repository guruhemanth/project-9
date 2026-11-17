/**
 * Unit tests for useRealtimeUpdates (Partner app)
 *
 * Uses vitest + @testing-library/react-hooks pattern.
 * Mocks the global WebSocket with a minimal stand-in.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeUpdates } from '../src/hooks/useRealtimeUpdates';

// ── WebSocket mock ──────────────────────────────────────────────────────────

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onclose: (() => void) | null = null;

  static lastInstance: MockWebSocket | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastInstance = this;
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  send(_data: string) {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.onerror?.({});
    this.close();
  }
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  localStorage.setItem('caterconnect_token', 'test-jwt-token');
  MockWebSocket.lastInstance = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.useRealTimers();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useRealtimeUpdates (partner)', () => {
  it('connects via WebSocket and sets connected = true on open', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeUpdates(handler, 'caterer-123', null),
    );

    expect(result.current.connected).toBe(false);

    await act(async () => {
      MockWebSocket.lastInstance?.open();
    });

    expect(result.current.connected).toBe(true);
  });

  it('calls handler when a booking_requested event arrives', async () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeUpdates(handler, 'caterer-123', null));

    await act(async () => {
      MockWebSocket.lastInstance?.open();
      MockWebSocket.lastInstance?.simulateMessage({
        event: 'booking_requested',
        payload: { bookingId: 'bk-1', catererId: 'caterer-123' },
        timestamp: new Date().toISOString(),
      });
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].event).toBe('booking_requested');
  });

  it('ignores connected and pong events', async () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeUpdates(handler, 'caterer-123', null));

    await act(async () => {
      MockWebSocket.lastInstance?.open();
      MockWebSocket.lastInstance?.simulateMessage({ event: 'connected', payload: {} });
      MockWebSocket.lastInstance?.simulateMessage({ event: 'pong', payload: {} });
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('sets connected = false and starts polling fallback on WS close', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ bookings: [] }),
      } as any);

    const handler = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeUpdates(handler, 'caterer-123', '/api/bookings/caterer/caterer-123'),
    );

    await act(async () => {
      MockWebSocket.lastInstance?.open();
    });

    expect(result.current.connected).toBe(true);

    // Simulate WS drop
    await act(async () => {
      MockWebSocket.lastInstance?.close();
    });

    expect(result.current.connected).toBe(false);

    // Let the poll interval fire
    await act(async () => {
      vi.advanceTimersByTime(5500);
    });

    // fetch should have been called (polling fallback)
    expect(fetchSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('emits booking_requested events found during polling', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    // No token = skip WS, go straight to polling
    localStorage.removeItem('caterconnect_token');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        bookings: [
          { id: 'bk-99', caterer_id: 'caterer-123', customer_id: 'cust-1', status: 'requested' },
        ],
      }),
    } as any);

    renderHook(() =>
      useRealtimeUpdates(handler, 'caterer-123', '/api/bookings/caterer/caterer-123'),
    );

    await act(async () => {
      vi.advanceTimersByTime(100); // immediate poll tick
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'booking_requested' }),
    );
  });
});
