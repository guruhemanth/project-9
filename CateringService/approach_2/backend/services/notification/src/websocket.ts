import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { Client } from 'pg';
import { pgPool } from './db';

interface AuthenticatedWsUser {
  userId: string;
  role: string;
  catererId?: string;
}

export class WsConnectionRegistry {
  private userSockets = new Map<string, Set<any>>();
  private catererSockets = new Map<string, Set<any>>();
  private adminSockets = new Set<any>();

  addConnection(user: AuthenticatedWsUser, socket: any): void {
    if (user.userId) {
      if (!this.userSockets.has(user.userId)) {
        this.userSockets.set(user.userId, new Set());
      }
      this.userSockets.get(user.userId)!.add(socket);
    }

    if (user.catererId) {
      if (!this.catererSockets.has(user.catererId)) {
        this.catererSockets.set(user.catererId, new Set());
      }
      this.catererSockets.get(user.catererId)!.add(socket);
    }

    if (user.role === 'admin') {
      this.adminSockets.add(socket);
    }
  }

  removeConnection(user: AuthenticatedWsUser, socket: any): void {
    if (user.userId && this.userSockets.has(user.userId)) {
      const set = this.userSockets.get(user.userId)!;
      set.delete(socket);
      if (set.size === 0) {
        this.userSockets.delete(user.userId);
      }
    }

    if (user.catererId && this.catererSockets.has(user.catererId)) {
      const set = this.catererSockets.get(user.catererId)!;
      set.delete(socket);
      if (set.size === 0) {
        this.catererSockets.delete(user.catererId);
      }
    }

    if (user.role === 'admin') {
      this.adminSockets.delete(socket);
    }
  }

  broadcast(envelope: any): void {
    const raw = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
    const data = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
    const payload = data.payload || {};

    const deliveredSockets = new Set<any>();

    const sendToSocket = (ws: any) => {
      if (ws && ws.readyState === 1 && !deliveredSockets.has(ws)) {
        try {
          ws.send(raw);
          deliveredSockets.add(ws);
        } catch {
          // ignore closed socket error
        }
      }
    };

    // 1. Deliver to customer
    if (payload.customerId && this.userSockets.has(payload.customerId)) {
      for (const socket of this.userSockets.get(payload.customerId)!) {
        sendToSocket(socket);
      }
    }
    if (payload.userId && this.userSockets.has(payload.userId)) {
      for (const socket of this.userSockets.get(payload.userId)!) {
        sendToSocket(socket);
      }
    }

    // 2. Deliver to caterer
    if (payload.catererId && this.catererSockets.has(payload.catererId)) {
      for (const socket of this.catererSockets.get(payload.catererId)!) {
        sendToSocket(socket);
      }
    }

    // 3. Deliver to admins
    for (const socket of this.adminSockets) {
      sendToSocket(socket);
    }
  }

  closeAll(): void {
    for (const set of this.userSockets.values()) {
      for (const ws of set) {
        try {
          ws.close();
        } catch {}
      }
    }
    this.userSockets.clear();
    this.catererSockets.clear();
    this.adminSockets.clear();
  }
}

export function verifyJwtToken(
  token: string,
  secret: string
): { sub: string; role: string; [key: string]: any } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;

  // Compute expected signature using secret
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const expectedBuf = Buffer.from(expectedSig);
  const sigBuf = Buffer.from(signature);

  if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired token
    }
    return payload;
  } catch {
    return null;
  }
}

export async function resolveCatererIdForOwner(ownerId: string): Promise<string | undefined> {
  try {
    const res = await pgPool.query('SELECT id FROM caterer_svc.caterers WHERE owner_id = $1 LIMIT 1', [ownerId]);
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function registerWebSocketBroadcaster(server: FastifyInstance, dbUrl: string) {
  const registry = new WsConnectionRegistry();
  const jwtSecret = process.env.JWT_SECRET || 'caterconnect-super-secret-development-jwt-key-min-32-chars';

  let listenClient: Client | null = null;
  let isClosing = false;

  const startListener = async () => {
    try {
      listenClient = new Client({ connectionString: dbUrl });
      await listenClient.connect();
      await listenClient.query('LISTEN caterconnect_events');

      listenClient.on('notification', (msg) => {
        if (msg.channel === 'caterconnect_events' && msg.payload) {
          try {
            const parsed = JSON.parse(msg.payload);
            registry.broadcast(parsed);
          } catch (err) {
            server.log.warn({ err }, 'Failed to parse caterconnect_events payload');
          }
        }
      });

      listenClient.on('error', (err) => {
        server.log.warn({ err }, 'PostgreSQL notification listener error');
        if (!isClosing) {
          setTimeout(startListener, 2000);
        }
      });
    } catch (err) {
      server.log.warn({ err }, 'Failed to connect PostgreSQL notification listener');
      if (!isClosing) {
        setTimeout(startListener, 3000);
      }
    }
  };

  startListener();

  server.addHook('onClose', async () => {
    isClosing = true;
    registry.closeAll();
    if (listenClient) {
      try {
        await listenClient.end();
      } catch {}
    }
  });

  const handleWebSocketConnection = async (socket: any, req: FastifyRequest) => {
    const query = req.query as Record<string, string | undefined>;
    let token = query?.token;

    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else {
        token = authHeader.trim();
      }
    }

    if (!token) {
      socket.send(JSON.stringify({ error: 'Unauthorized', message: 'Authentication token required' }));
      socket.close(1008, 'Authentication token required');
      return;
    }

    const verified = verifyJwtToken(token, jwtSecret);
    if (!verified || !verified.sub) {
      socket.send(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or expired authentication token' }));
      socket.close(1008, 'Invalid or expired token');
      return;
    }

    let catererId: string | undefined = undefined;
    if (verified.role === 'caterer') {
      catererId = await resolveCatererIdForOwner(verified.sub);
      // In case the sub itself is the caterer id
      if (!catererId) {
        catererId = verified.sub;
      }
    }

    const wsUser: AuthenticatedWsUser = {
      userId: verified.sub,
      role: verified.role,
      catererId,
    };

    registry.addConnection(wsUser, socket);

    socket.on('close', () => {
      registry.removeConnection(wsUser, socket);
    });

    socket.on('error', () => {
      registry.removeConnection(wsUser, socket);
    });

    socket.on('message', (messageData: any) => {
      try {
        const text = typeof messageData === 'string' ? messageData : messageData.toString();
        const parsed = JSON.parse(text);
        if (parsed.event === 'ping') {
          socket.send(JSON.stringify({ event: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch {
        // ignore non-json messages
      }
    });

    // Send connection established confirmation
    socket.send(
      JSON.stringify({
        event: 'connected',
        timestamp: new Date().toISOString(),
        payload: { userId: wsUser.userId, role: wsUser.role },
      })
    );
  };

  // Register WebSocket routes
  server.register(async (subServer) => {
    subServer.get('/api/events/ws', { websocket: true }, handleWebSocketConnection);
    subServer.get('/api/notify/ws', { websocket: true }, handleWebSocketConnection);
  });

  return registry;
}
