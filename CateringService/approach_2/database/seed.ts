import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root if present to override machine environment
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

async function runSeed() {
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    console.error('\n[FATAL SECURITY VIOLATION] Refusing to seed mock database records in PRODUCTION!');
    console.error('db:seed can only be run in development or staging environments.\n');
    process.exit(1);
  }

  const connectionString =
    process.env.CATER_DATABASE_URL ||
    process.env.CATERDBURL ||
    process.env.APP_DATABASE_URL ||
    (process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('54322') || process.env.DATABASE_URL.includes('caterconnect'))
      ? process.env.DATABASE_URL
      : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const seedFilePath = path.join(__dirname, '02_seed_data.sql');
    if (!fs.existsSync(seedFilePath)) {
      throw new Error(`Seed SQL file not found at ${seedFilePath}`);
    }

    const sql = fs.readFileSync(seedFilePath, 'utf-8');
    console.log(`[Seed] Executing 02_seed_data.sql against environment: ${nodeEnv}...`);

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('[Seed] Database successfully seeded with demo caterers, packages, and users.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed Error]: Seeding transaction failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeed();
