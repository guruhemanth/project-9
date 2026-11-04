import pg from 'pg';
import { validateEnv, createDbEnvSchema } from '@caterconnect/shared';

const { Pool } = pg;
const env = validateEnv(createDbEnvSchema(), process.env);

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pgPool.on('error', (err: Error) => {
  console.error('[Postgres Pool Error (notification-service)]: Unexpected idle client error:', err.message);
});
