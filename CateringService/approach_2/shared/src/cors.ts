import { resolveAllowedOrigins } from './env';

export interface CorsOptionsConfig {
  allowedOrigins?: string;
  nodeEnv?: string;
}

export function buildCorsOptions(allowedOriginsStr?: string, nodeEnv = 'development') {
  const isDev = nodeEnv === 'development' || nodeEnv === 'test';
  const allowed = resolveAllowedOrigins(allowedOriginsStr, isDev);

  return {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      // Allow requests with no origin (such as mobile apps, server-to-server, curl)
      if (!origin) {
        return cb(null, true);
      }

      if (allowed.includes(origin)) {
        return cb(null, true);
      }

      // In development mode, dynamically permit ngrok and localhost tunnels
      if (isDev && (origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok.io') || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        return cb(null, true);
      }

      // Reject unauthorized origins with a descriptive error
      return cb(new Error(`Origin '${origin}' is not allowed by CaterConnect CORS policy.`), false);
    },
  };
}
