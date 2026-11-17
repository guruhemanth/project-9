export interface WsEventEnvelope {
  event: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface WsClientOptions {
  token?: string;
  timeoutMs?: number;
}

export class E2EWebSocketClient {
  private ws: WebSocket | null = null;
  public events: WsEventEnvelope[] = [];
  public rawMessages: string[] = [];
  public isConnected = false;
  public lastError: Error | null = null;
  public closeCode: number | null = null;
  public closeReason: string | null = null;

  constructor(private url: string, private options: WsClientOptions = {}) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let targetUrl = this.url;
      if (this.options.token) {
        const separator = targetUrl.includes('?') ? '&' : '?';
        targetUrl = `${targetUrl}${separator}token=${encodeURIComponent(this.options.token)}`;
      }

      try {
        this.ws = new WebSocket(targetUrl);
      } catch (err: any) {
        return reject(err);
      }

      const timeout = setTimeout(() => {
        if (!this.isConnected) {
          this.close();
          reject(new Error(`WebSocket connection to ${targetUrl} timed out after ${this.options.timeoutMs ?? 5000}ms`));
        }
      }, this.options.timeoutMs ?? 5000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.isConnected = true;
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        const dataStr = typeof event.data === 'string' ? event.data : event.data.toString();
        this.rawMessages.push(dataStr);
        try {
          const parsed = JSON.parse(dataStr);
          this.events.push(parsed);
        } catch {
          // Non-JSON message received
        }
      };

      this.ws.onerror = (event: Event) => {
        this.lastError = new Error('WebSocket error event received');
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.isConnected = false;
        this.closeCode = event.code;
        this.closeReason = event.reason;
      };
    });
  }

  send(data: unknown): void {
    if (!this.ws || !this.isConnected) {
      throw new Error('Cannot send on closed or uninitialized WebSocket');
    }
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws.send(message);
  }

  async waitForEvent(
    predicate: (envelope: WsEventEnvelope) => boolean,
    timeoutMs = 5000,
  ): Promise<WsEventEnvelope> {
    const existing = this.events.find(predicate);
    if (existing) return existing;

    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const found = this.events.find(predicate);
        if (found) {
          clearInterval(interval);
          resolve(found);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(
            new Error(
              `Timed out after ${timeoutMs}ms waiting for WebSocket event. Received: ${JSON.stringify(this.events)}`,
            ),
          );
        }
      }, 50);
    });
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore closing error
      }
      this.ws = null;
      this.isConnected = false;
    }
  }
}

export function createWsClient(url: string, options: WsClientOptions = {}): E2EWebSocketClient {
  return new E2EWebSocketClient(url, options);
}

export function computePollingInterval(baseMs = 3000, jitterMaxMs = 2000): number {
  const jitter = Math.floor(Math.random() * jitterMaxMs);
  return baseMs + jitter;
}

export function computeBackoff(attempt: number, initialMs = 1000, maxMs = 30000): number {
  return Math.min(initialMs * Math.pow(2, attempt), maxMs);
}

export async function simulatePollingFallback<T>(
  pollFn: () => Promise<T>,
  predicate: (data: T) => boolean,
  intervalMs = 3000,
  maxAttempts = 5,
): Promise<{ data: T; attempts: number; elapsedMs: number }> {
  const start = Date.now();
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const res = await pollFn();
    if (predicate(res)) {
      return { data: res, attempts, elapsedMs: Date.now() - start };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Polling fallback condition not met after ${attempts} attempts`);
}
