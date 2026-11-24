import './env-setup';
import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { closeDbPool } from './db-helper';

export interface RunningServers {
  auth?: FastifyInstance;
  caterer?: FastifyInstance;
  booking?: FastifyInstance;
  payment?: FastifyInstance;
  notification?: FastifyInstance;
  chat?: FastifyInstance;
  gateway?: FastifyInstance;
}

let runningServers: RunningServers = {};
let isExternalStack = false;
let isGlobalManaged = false;

export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

export async function isStackRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:8080/ready', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startAllServers(isGlobal = false): Promise<RunningServers> {
  if (isGlobal) {
    isGlobalManaged = true;
  }

  // If stack is already running on port 8080, reuse it
  if (await isStackRunning()) {
    isExternalStack = true;
    return runningServers;
  }

  const { buildAuthServer } = await import('../../../backend/services/auth/src/index');
  const { buildCatererServer } = await import('../../../backend/services/caterer-menu/src/index');
  const { buildBookingServer } = await import('../../../backend/services/booking-order/src/index');
  const { buildPaymentServer } = await import('../../../backend/services/payment/src/index');
  const { buildNotificationServer } = await import('../../../backend/services/notification/src/index');
  const { buildChatServer } = await import('../../../backend/services/chat/src/index');
  const { buildGatewayServer } = await import('../../../backend/gateway/src/index');

  const servers: RunningServers = {};

  try {
    // 1. Auth Service (4001)
    if (!(await isPortInUse(4001))) {
      servers.auth = buildAuthServer();
      await servers.auth.listen({ port: 4001, host: '127.0.0.1' });
    }

    // 2. Caterer & Menu Service (4002)
    if (!(await isPortInUse(4002))) {
      servers.caterer = buildCatererServer();
      await servers.caterer.listen({ port: 4002, host: '127.0.0.1' });
    }

    // 3. Booking & Order Service (4003)
    if (!(await isPortInUse(4003))) {
      servers.booking = buildBookingServer();
      await servers.booking.listen({ port: 4003, host: '127.0.0.1' });
    }

    // 4. Payment Service (4004)
    if (!(await isPortInUse(4004))) {
      servers.payment = buildPaymentServer();
      await servers.payment.listen({ port: 4004, host: '127.0.0.1' });
    }

    // 5. Notification Service (4005)
    if (!(await isPortInUse(4005))) {
      servers.notification = buildNotificationServer();
      await servers.notification.listen({ port: 4005, host: '127.0.0.1' });
    }

    // 6. Chat Service (4006)
    if (!(await isPortInUse(4006))) {
      servers.chat = buildChatServer();
      await servers.chat.listen({ port: 4006, host: '127.0.0.1' });
    }

    // 7. API Gateway (8080)
    if (!(await isPortInUse(8080))) {
      servers.gateway = buildGatewayServer();
      await servers.gateway.listen({ port: 8080, host: '127.0.0.1' });
    }

    runningServers = servers;

    // Verify readiness
    const startTime = Date.now();
    let ready = false;
    while (Date.now() - startTime < 10000) {
      if (await isStackRunning()) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!ready) {
      console.warn('[ServerManager] Gateway /ready check timed out after 10s');
    }

    return runningServers;
  } catch (err: any) {
    console.error('[ServerManager] Failed to start server stack:', err);
    await stopAllServers(true);
    throw err;
  }
}

export async function stopAllServers(force = false): Promise<void> {
  if (isGlobalManaged && !force) {
    return;
  }

  if (isExternalStack && !force) {
    return;
  }

  const closePromises: Promise<any>[] = [];

  if (runningServers.gateway) {
    closePromises.push(runningServers.gateway.close().catch(() => {}));
  }
  if (runningServers.notification) {
    closePromises.push(runningServers.notification.close().catch(() => {}));
  }
  if (runningServers.chat) {
    closePromises.push(runningServers.chat.close().catch(() => {}));
  }
  if (runningServers.payment) {
    closePromises.push(runningServers.payment.close().catch(() => {}));
  }
  if (runningServers.booking) {
    closePromises.push(runningServers.booking.close().catch(() => {}));
  }
  if (runningServers.caterer) {
    closePromises.push(runningServers.caterer.close().catch(() => {}));
  }
  if (runningServers.auth) {
    closePromises.push(runningServers.auth.close().catch(() => {}));
  }

  await Promise.all(closePromises);
  runningServers = {};
  isGlobalManaged = false;
  isExternalStack = false;

  await closeDbPool();
}

export function getGatewayUrl(): string {
  return 'http://127.0.0.1:8080';
}

export function getWsUrl(): string {
  return 'ws://127.0.0.1:8080/api/events/ws';
}
