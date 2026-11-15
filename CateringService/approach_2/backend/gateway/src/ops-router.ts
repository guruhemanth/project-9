import { FastifyInstance } from 'fastify';
import http from 'node:http';
import os from 'node:os';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import type {
  ServiceNodeMetric,
  HostServerMetrics,
  ContainerInfo,
  OpsNodesResponse,
  OpsLogsResponse,
  NodeHealthStatus,
} from '@caterconnect/shared';

interface NodeConfig {
  id: string;
  name: string;
  serviceKey: string;
  defaultHost: string;
  port: number;
  healthPath: string;
  envVar: string;
}

const MONITORED_NODES: NodeConfig[] = [
  {
    id: 'gateway',
    name: 'API Gateway',
    serviceKey: 'caterconnect-api-gateway',
    defaultHost: '127.0.0.1',
    port: 8080,
    healthPath: '/ready',
    envVar: 'GATEWAY_URL',
  },
  {
    id: 'auth-service',
    name: 'Auth & Identity Service',
    serviceKey: 'caterconnect-auth-service',
    defaultHost: process.env.AUTH_SERVICE_URL ? new URL(process.env.AUTH_SERVICE_URL).hostname : 'auth-service',
    port: 4001,
    healthPath: '/ready',
    envVar: 'AUTH_SERVICE_URL',
  },
  {
    id: 'caterer-menu-service',
    name: 'Caterer & Menu Service',
    serviceKey: 'caterconnect-caterer-menu-service',
    defaultHost: process.env.CATERER_SERVICE_URL ? new URL(process.env.CATERER_SERVICE_URL).hostname : 'caterer-menu-service',
    port: 4002,
    healthPath: '/ready',
    envVar: 'CATERER_SERVICE_URL',
  },
  {
    id: 'booking-order-service',
    name: 'Booking & Order Service',
    serviceKey: 'caterconnect-booking-order-service',
    defaultHost: process.env.BOOKING_SERVICE_URL ? new URL(process.env.BOOKING_SERVICE_URL).hostname : 'booking-order-service',
    port: 4003,
    healthPath: '/ready',
    envVar: 'BOOKING_SERVICE_URL',
  },
  {
    id: 'payment-service',
    name: 'Payment & Settlement Service',
    serviceKey: 'caterconnect-payment-service',
    defaultHost: process.env.PAYMENT_SERVICE_URL ? new URL(process.env.PAYMENT_SERVICE_URL).hostname : 'payment-service',
    port: 4004,
    healthPath: '/ready',
    envVar: 'PAYMENT_SERVICE_URL',
  },
  {
    id: 'notification-service',
    name: 'Notification & SMS Service',
    serviceKey: 'caterconnect-notification-service',
    defaultHost: process.env.NOTIFICATION_SERVICE_URL ? new URL(process.env.NOTIFICATION_SERVICE_URL).hostname : 'notification-service',
    port: 4005,
    healthPath: '/ready',
    envVar: 'NOTIFICATION_SERVICE_URL',
  },
  {
    id: 'chat-service',
    name: 'Chat & Real-time Messaging Service',
    serviceKey: 'caterconnect-chat-service',
    defaultHost: process.env.CHAT_SERVICE_URL ? new URL(process.env.CHAT_SERVICE_URL).hostname : 'chat-service',
    port: 4006,
    healthPath: '/ready',
    envVar: 'CHAT_SERVICE_URL',
  },
];

/**
 * Ping an HTTP endpoint and measure latency in milliseconds
 */
function pingHttpNode(host: string, port: number, path: string, timeoutMs = 3000): Promise<{
  latencyMs: number;
  httpStatus: number;
  body?: any;
  error?: string;
}> {
  return new Promise((resolve) => {
    const tStart = performance.now();
    const req = http.request(
      {
        host,
        port,
        path,
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        let bodyStr = '';
        res.on('data', (chunk) => (bodyStr += chunk));
        res.on('end', () => {
          const tEnd = performance.now();
          const latencyMs = Math.round(tEnd - tStart);
          let parsed;
          try {
            parsed = JSON.parse(bodyStr);
          } catch {
            parsed = bodyStr;
          }
          resolve({
            latencyMs,
            httpStatus: res.statusCode || 200,
            body: parsed,
          });
        });
      }
    );

    req.on('error', (err) => {
      const tEnd = performance.now();
      resolve({
        latencyMs: Math.round(tEnd - tStart),
        httpStatus: 0,
        error: err.message || 'Connection refused or unreachable',
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        latencyMs: timeoutMs,
        httpStatus: 408,
        error: `Request timeout (${timeoutMs}ms)`,
      });
    });

    req.end();
  });
}

/**
 * Ping PostgreSQL port via raw TCP socket
 */
function pingTcpPort(host: string, port: number, timeoutMs = 2500): Promise<{ latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const tStart = performance.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const latencyMs = Math.round(performance.now() - tStart);
      socket.destroy();
      resolve({ latencyMs });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({ latencyMs: Math.round(performance.now() - tStart), error: err.message });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ latencyMs: timeoutMs, error: 'Connection timeout' });
    });
  });
}

/**
 * Query Docker Engine REST API through read-only Unix domain socket
 */
function queryDockerSocket(path: string, timeoutMs = 3500): Promise<{ data: Buffer; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const req = http.request(
      {
        socketPath: '/var/run/docker.sock',
        path,
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            data: Buffer.concat(chunks),
            statusCode: res.statusCode || 200,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Docker API request timeout (${timeoutMs}ms)`));
    });

    req.end();
  });
}

/**
 * Strip Docker stream 8-byte multiplex headers from log buffer
 */
function parseDockerLogs(rawBuffer: Buffer): string[] {
  const lines: string[] = [];
  let offset = 0;

  // If buffer doesn't look multiplexed, split lines directly
  if (rawBuffer.length < 8) {
    return rawBuffer.toString('utf-8').split('\n').filter(Boolean);
  }

  while (offset + 8 <= rawBuffer.length) {
    const streamType = rawBuffer.readUInt8(offset);
    // Docker stream types: 1 = stdout, 2 = stderr, 0 = stdin
    if (streamType === 1 || streamType === 2 || streamType === 0) {
      const size = rawBuffer.readUInt32BE(offset + 4);
      if (offset + 8 + size <= rawBuffer.length) {
        const payload = rawBuffer.subarray(offset + 8, offset + 8 + size).toString('utf-8');
        lines.push(...payload.split('\n'));
        offset += 8 + size;
        continue;
      }
    }
    // Fallback: raw line splitting
    return rawBuffer
      .toString('utf-8')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .split('\n')
      .filter((l) => l.trim().length > 0);
  }

  return lines.filter((l) => l.trim().length > 0);
}

/**
 * Register ops monitoring routes
 */
export function registerOpsRoutes(server: FastifyInstance, adminAuthPreHandler: any) {
  // 1. GET /api/admin/ops/nodes - Status and response times of all 8 core nodes
  server.get('/api/admin/ops/nodes', { preHandler: adminAuthPreHandler }, async (_req, reply) => {
    try {
      const nodePromises = MONITORED_NODES.map(async (n): Promise<ServiceNodeMetric> => {
        if (n.id === 'gateway') {
          return {
            id: n.id,
            name: n.name,
            serviceKey: n.serviceKey,
            url: `http://${n.defaultHost}:${n.port}`,
            port: n.port,
            status: 'healthy',
            latencyMs: 1,
            httpStatus: 200,
            uptimeSeconds: Math.floor(process.uptime()),
            lastChecked: new Date().toISOString(),
          };
        }

        // Try primary host (e.g. docker container hostname) and fallback to 127.0.0.1
        let result = await pingHttpNode(n.defaultHost, n.port, n.healthPath, 2500);
        if (result.error && n.defaultHost !== '127.0.0.1') {
          const fallback = await pingHttpNode('127.0.0.1', n.port, n.healthPath, 2500);
          if (!fallback.error) {
            result = fallback;
          }
        }

        let status: NodeHealthStatus = 'healthy';
        if (result.error || result.httpStatus === 0) {
          status = 'down';
        } else if (result.latencyMs > 500 || result.httpStatus >= 400) {
          status = 'degraded';
        }

        return {
          id: n.id,
          name: n.name,
          serviceKey: n.serviceKey,
          url: `http://${n.defaultHost}:${n.port}`,
          port: n.port,
          status,
          latencyMs: result.latencyMs,
          httpStatus: result.httpStatus,
          uptimeSeconds: result.body?.uptime,
          lastChecked: new Date().toISOString(),
          error: result.error,
          details: typeof result.body === 'object' ? result.body : undefined,
        };
      });

      // PostgreSQL database check
      const pgHost = process.env.PG_HOST || 'postgres';
      const pgPromise = (async (): Promise<ServiceNodeMetric> => {
        let res = await pingTcpPort(pgHost, 5432, 2500);
        if (res.error && pgHost !== '127.0.0.1') {
          const localCheck = await pingTcpPort('127.0.0.1', 54322, 2500);
          if (!localCheck.error) {
            res = localCheck;
          }
        }

        const status: NodeHealthStatus = res.error ? 'down' : res.latencyMs > 300 ? 'degraded' : 'healthy';
        return {
          id: 'postgres',
          name: 'PostgreSQL Database Engine',
          serviceKey: 'caterconnect-postgres',
          url: `postgresql://${pgHost}:5432/caterconnect`,
          port: 5432,
          status,
          latencyMs: res.latencyMs,
          httpStatus: res.error ? 0 : 200,
          lastChecked: new Date().toISOString(),
          error: res.error,
        };
      })();

      const [microserviceNodes, pgNode] = await Promise.all([
        Promise.all(nodePromises),
        pgPromise,
      ]);

      const allNodes = [...microserviceNodes, pgNode];

      const healthyCount = allNodes.filter((n) => n.status === 'healthy').length;
      const degradedCount = allNodes.filter((n) => n.status === 'degraded').length;
      const downCount = allNodes.filter((n) => n.status === 'down').length;
      const totalLatencies = allNodes.reduce((acc, n) => acc + (n.status !== 'down' ? n.latencyMs : 0), 0);
      const activeCount = healthyCount + degradedCount;
      const avgLatencyMs = activeCount > 0 ? Math.round(totalLatencies / activeCount) : 0;

      // Host server metrics
      const totalMemBytes = os.totalmem();
      const freeMemBytes = os.freemem();
      const usedMemPct = Math.round(((totalMemBytes - freeMemBytes) / totalMemBytes) * 100);

      const hostMetrics: HostServerMetrics = {
        totalMemBytes,
        freeMemBytes,
        usedMemPct,
        loadAvg: os.loadavg() as [number, number, number],
        uptimeSeconds: Math.floor(os.uptime()),
        cpuCount: os.cpus().length,
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
      };

      const response: OpsNodesResponse = {
        timestamp: new Date().toISOString(),
        host: hostMetrics,
        nodes: allNodes,
        summary: {
          totalNodes: allNodes.length,
          healthyCount,
          degradedCount,
          downCount,
          avgLatencyMs,
        },
      };

      return reply.send(response);
    } catch (err: any) {
      server.log.error(err, 'Failed to collect ops node metrics');
      return reply.status(500).send({
        error: 'Failed to collect node metrics',
        message: err.message,
      });
    }
  });

  // 2. GET /api/admin/ops/containers - Active Docker container stats
  server.get('/api/admin/ops/containers', { preHandler: adminAuthPreHandler }, async (_req, reply) => {
    try {
      let raw: { data: Buffer; statusCode: number };
      try {
        raw = await queryDockerSocket('/containers/json?all=true');
      } catch (dockerErr: any) {
        // Fallback for environments where docker.sock is not mounted (e.g. bare metal local dev)
        const simulated: ContainerInfo[] = MONITORED_NODES.map((n) => ({
          id: n.id,
          name: n.serviceKey,
          image: `caterconnect/${n.id}:latest`,
          state: 'running',
          status: 'Up (local dev process)',
          created: Math.floor(Date.now() / 1000) - Math.floor(process.uptime()),
          ports: `${n.port}/tcp`,
        }));
        simulated.push({
          id: 'postgres',
          name: 'caterconnect-postgres',
          image: 'postgres:15-alpine',
          state: 'running',
          status: 'Up (local DB)',
          created: Math.floor(Date.now() / 1000) - 86400,
          ports: '5432/tcp',
        });
        return reply.send({
          containers: simulated,
          source: 'simulated',
          note: `Docker socket unavailable (${dockerErr.message}). Displaying registered services.`,
        });
      }

      const parsed = JSON.parse(raw.data.toString('utf-8'));
      const containers: ContainerInfo[] = (parsed || []).map((c: any) => {
        const rawName = (c.Names && c.Names[0]) || c.Id;
        const cleanName = rawName.replace(/^\//, '');
        return {
          id: c.Id.substring(0, 12),
          name: cleanName,
          image: c.Image,
          state: c.State,
          status: c.Status,
          created: c.Created,
          ports: (c.Ports || []).map((p: any) => (p.PublicPort ? `${p.PublicPort}->${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`)).join(', '),
        };
      });

      // Sort so caterconnect containers appear first
      containers.sort((a, b) => {
        const aIsCater = a.name.includes('caterconnect');
        const bIsCater = b.name.includes('caterconnect');
        if (aIsCater && !bIsCater) return -1;
        if (!aIsCater && bIsCater) return 1;
        return a.name.localeCompare(b.name);
      });

      return reply.send({ containers, source: 'docker-engine' });
    } catch (err: any) {
      server.log.error(err, 'Failed to retrieve container list');
      return reply.status(500).send({ error: 'Failed to retrieve containers', message: err.message });
    }
  });

  // 3. GET /api/admin/ops/logs - Live stdout/stderr log checking
  server.get('/api/admin/ops/logs', { preHandler: adminAuthPreHandler }, async (req, reply) => {
    const query = req.query as {
      container?: string;
      tail?: string;
      filter?: string;
    };

    const container = query.container || 'caterconnect-api-gateway';
    const tailCount = Math.min(Math.max(parseInt(query.tail || '100', 10) || 100, 10), 500);
    const filter = (query.filter || '').trim().toLowerCase();

    try {
      let raw: { data: Buffer; statusCode: number };
      try {
        raw = await queryDockerSocket(
          `/containers/${encodeURIComponent(container)}/logs?stdout=true&stderr=true&tail=${tailCount}&timestamps=true`
        );
      } catch (sockErr: any) {
        // Fallback simulated logs for offline/local environments
        const timestamp = new Date().toISOString();
        const fallbackLines = [
          `[${timestamp}] [INFO] [${container}] Service operational. (Docker socket not mounted: ${sockErr.message})`,
          `[${timestamp}] [INFO] [${container}] Health check /ready: 200 OK`,
          `[${timestamp}] [INFO] [${container}] Active database connection pool initialized`,
          `[${timestamp}] [INFO] [${container}] Processing incoming requests smoothly`,
        ];
        return reply.send({
          container,
          lines: fallbackLines,
          tail: tailCount,
          timestamp,
          source: 'simulated',
        } as OpsLogsResponse);
      }

      let lines = parseDockerLogs(raw.data);
      if (filter) {
        lines = lines.filter((l) => l.toLowerCase().includes(filter));
      }

      return reply.send({
        container,
        lines,
        tail: tailCount,
        timestamp: new Date().toISOString(),
        source: 'docker-engine',
      } as OpsLogsResponse);
    } catch (err: any) {
      server.log.error(err, 'Failed to stream logs');
      return reply.status(500).send({ error: 'Failed to stream logs', message: err.message });
    }
  });
}
