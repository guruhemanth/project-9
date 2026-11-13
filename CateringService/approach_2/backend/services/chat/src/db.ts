import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { validateEnv, createDbEnvSchema } from '@caterconnect/shared';

// Ensure approach_2/.env is loaded with precedence over machine environment variables
const envPath = path.resolve(__dirname, '../../../../.env');
if (fs.existsSync(envPath)) {
  const servicePort = process.env.PORT;
  dotenv.config({ path: envPath, override: true });
  // Prevent root .env PORT=8080 from overriding microservice port 4006
  if (servicePort && servicePort !== '8080') {
    process.env.PORT = servicePort;
  } else {
    process.env.PORT = '4006';
  }
}

const { Pool } = pg;
const env = validateEnv(createDbEnvSchema(), process.env);

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pgPool.on('error', (err: Error) => {
  console.error('[Postgres Pool Error (chat-service)]: Unexpected idle client error:', err.message);
});
