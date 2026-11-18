import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { validateEnv, createDbEnvSchema } from '@caterconnect/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure approach_2/.env is loaded with precedence over default fallbacks
const envPath = path.resolve(__dirname, '../../../../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key === 'DATABASE_URL' || !process.env[key]) {
        process.env[key] = val;
      }
    }
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
  console.error('[Postgres Pool Error (notification-service)]: Unexpected idle client error:', err.message);
});
