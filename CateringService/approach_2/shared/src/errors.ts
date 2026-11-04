import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export interface StandardErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  requestId: string;
  timestamp: string;
  details?: unknown;
}

export const loggerRedactionConfig = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'body.password',
    'body.token',
    'body.refreshToken',
    'body.secret',
    'body.keySecret',
  ],
  censor: '[REDACTED]',
};

/**
 * Registers a production-grade sanitized error handler across Fastify instances.
 * Logs full stack traces and sensitive error parameters internally to Pino while
 * presenting a clean, safe, and standardized JSON error response to external clients.
 */
export function registerCentralizedErrorHandler(server: FastifyInstance, serviceName: string): void {
  server.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const isProd = process.env.NODE_ENV === 'production';
    const requestId = (request.id as string) || (request.headers['x-request-id'] as string) || `req-${Date.now()}`;
    
    // Determine status code
    let statusCode = error.statusCode || (reply.statusCode >= 400 ? reply.statusCode : 500);
    if (error.validation) {
      statusCode = 400;
    }

    // Structured internal log (includes full trace and metadata)
    request.log.error(
      {
        service: serviceName,
        requestId,
        statusCode,
        err: error,
      },
      error.message
    );

    // Sanitize response in production for 500 errors to prevent leaking database schemas, SQL queries, or internals
    let message = error.message;
    let errorName = error.name || 'Internal Server Error';

    if (statusCode >= 500) {
      errorName = 'Internal Server Error';
      if (isProd) {
        message = 'An unexpected internal error occurred. Please contact support quoting the requestId.';
      }
    } else if (statusCode === 400 && error.validation) {
      errorName = 'ValidationError';
    }

    const payload: StandardErrorResponse = {
      statusCode,
      error: errorName,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(error.validation ? { details: error.validation } : {}),
    };

    return reply.status(statusCode).send(payload);
  });
}
