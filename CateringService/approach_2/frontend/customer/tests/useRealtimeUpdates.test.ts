/**
 * Unit tests for useRealtimeUpdates (Customer app)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeUpdates } from '../src/hooks/useRealtimeUpdates';

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
}

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

describe('useRealtimeUpdates (customer)', () => {
  it('opens WebSocket and signals connected = true', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeUpdates(handler, null));

    await act(async () => {
      MockWebSocket.lastInstance?.open();
    });

    expect(result.current.connected).toBe(true);
  });

  it('fires handler on booking_accepted event', async () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeUpdates(handler, null));

    await act(async () => {
      MockWebSocket.lastInstance?.open();
      MockWebSocket.lastInstance?.simulateMessage({
        event: 'booking_accepted',
        payload: { bookingId: 'bk-77', catererId: 'cat-1', customerId: 'cust-7' },
      });
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].event).toBe('booking_accepted');
  });

  it('fires handler on payment.paid event', async () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeUpdates(handler, null));

    await act(async () => {
      MockWebSocket.lastInstance?.open();
      MockWebSocket.lastInstance?.simulateMessage({
        event: 'payment.paid',
        payload: { bookingId: 'bk-77' },
      });
    });

    expect(handler.mock.calls[0][0].event).toBe('payment.paid');
  });

  it('falls back to polling and emits booking_accepted from poll results', async () => {
    vi.useFakeTimers();
    localStorage.removeItem('caterconnect_token');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        bookings: [
          { id: 'bk-55', caterer_id: 'cat-1', customer_id: 'cust-7', status: 'accepted' },
        ],
      }),
    } as any);

    const handler = vi.fn();
    renderHook(() => useRealtimeUpdates(handler, '/api/bookings/customer'));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'booking_accepted' }),
    );
  });

  it('reconnects after WS close with exponential back-off', async () => {
    vi.useFakeTimers();
    let wsCount = 0;
    vi.stubGlobal(
      'WebSocket',
      class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          wsCount++;
          MockWebSocket.lastInstance = this;
        }
      },
    );

    const handler = vi.fn();
    renderHook(() => useRealtimeUpdates(handler, null));

    await act(async () => {
      MockWebSocket.lastInstance?.open();
    });

    await act(async () => {
      MockWebSocket.lastInstance?.close();
      vi.advanceTimersByTime(1500); // first back-off: 1s
    });

    expect(wsCount).toBeGreaterThanOrEqual(2); // reconnected
  });
});
