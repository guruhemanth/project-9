import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerCentralizedErrorHandler, loggerRedactionConfig } from '../src/errors';

describe('Centralized Error Handler & Structured Logging', () => {
  it('has logger redaction configured for sensitive keys', () => {
    expect(loggerRedactionConfig.paths).toContain('req.headers.authorization');
    expect(loggerRedactionConfig.paths).toContain('body.password');
    expect(loggerRedactionConfig.paths).toContain('body.token');
    expect(loggerRedactionConfig.censor).toBe('[REDACTED]');
  });

  it('sanitizes 500 internal errors in production without leaking internal messages', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const server = Fastify();
    registerCentralizedErrorHandler(server, 'test-service');

    server.get('/cause-error', async () => {
      throw new Error('SELECT * FROM secret_table WHERE leak = 1');
    });

    const res = await server.inject({ method: 'GET', url: '/cause-error' });
    expect(res.statusCode).toBe(500);

    const body = res.json();
    expect(body.statusCode).toBe(500);
    expect(body.error).toBe('Internal Server Error');
    expect(body.message).not.toContain('secret_table');
    expect(body.message).toContain('An unexpected internal error occurred');
    expect(body.requestId).toBeDefined();
    expect(body.timestamp).toBeDefined();

    process.env.NODE_ENV = origEnv;
    await server.close();
  });

  it('preserves client error messages for 4xx status codes', async () => {
    const server = Fastify();
    registerCentralizedErrorHandler(server, 'test-service');

    server.get('/client-error', async (_req, reply) => {
      return reply.status(404).send(new Error('Requested resource not found'));
    });

    const res = await server.inject({ method: 'GET', url: '/client-error' });
    expect(res.statusCode).toBe(404);

    const body = res.json();
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('Requested resource not found');
    expect(body.requestId).toBeDefined();

    await server.close();
  });
});
