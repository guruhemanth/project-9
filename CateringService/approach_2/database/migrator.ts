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

interface MigrationDefinition {
  name: string;
  upFile: string;
  downSql: string;
}

const MIGRATIONS: MigrationDefinition[] = [
  {
    name: '01_init_schemas',
    upFile: '01_init_schemas.sql',
    downSql: `
      DROP SCHEMA IF EXISTS auth_svc CASCADE;
      DROP SCHEMA IF EXISTS caterer_svc CASCADE;
      DROP SCHEMA IF EXISTS order_svc CASCADE;
      DROP SCHEMA IF EXISTS pay_svc CASCADE;
    `,
  },
  {
    name: '03_availability_schema',
    upFile: '03_availability_schema.sql',
    downSql: `
      DROP TABLE IF EXISTS caterer_svc.caterer_availability CASCADE;
    `,
  },
  {
    name: '04_settlement_schema',
    upFile: '04_settlement_schema.sql',
    downSql: `
      DROP TABLE IF EXISTS pay_svc.caterer_settlements CASCADE;
    `,
  },
  {
    name: '05_notification_schema',
    upFile: '05_notification_schema.sql',
    downSql: `
      DROP SCHEMA IF EXISTS notify_svc CASCADE;
    `,
  },
  {
    name: '06_chat_schema',
    upFile: '06_chat_schema.sql',
    downSql: `
      DROP SCHEMA IF EXISTS chat_svc CASCADE;
    `,
  },
  {
    name: '07_pan_india_location',
    upFile: '07_pan_india_location.sql',
    downSql: `
      DROP INDEX IF EXISTS caterer_svc.idx_caterers_city_state;
      DROP INDEX IF EXISTS order_svc.idx_bookings_city_state;
      ALTER TABLE caterer_svc.caterers DROP COLUMN IF EXISTS state, DROP COLUMN IF EXISTS pincode, DROP COLUMN IF EXISTS address;
      ALTER TABLE order_svc.bookings DROP COLUMN IF EXISTS state, DROP COLUMN IF EXISTS pincode;
    `,
  },
];

function getConnectionString(): string {
  if (process.env.CATER_DATABASE_URL) return process.env.CATER_DATABASE_URL;
  if (process.env.CATERDBURL) return process.env.CATERDBURL;
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL;
  if (process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('54322') || process.env.DATABASE_URL.includes('caterconnect'))) {
    return process.env.DATABASE_URL;
  }
  // Default to local container
  return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
}

async function getClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: getConnectionString() });
  await client.connect();
  return client;
}

async function ensureMigrationTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public._schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client: pg.Client): Promise<Map<string, Date>> {
  const res = await client.query(`SELECT name, applied_at FROM public._schema_migrations ORDER BY id ASC`);
  const map = new Map<string, Date>();
  for (const row of res.rows) {
    map.set(row.name, row.applied_at);
  }
  return map;
}

export async function runMigrateUp(): Promise<void> {
  const client = await getClient();
  try {
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);

    console.log('[Migrator] Checking migration status...');
    let appliedCount = 0;

    for (const m of MIGRATIONS) {
      if (applied.has(m.name)) {
        continue;
      }

      const filePath = path.join(__dirname, m.upFile);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Migration SQL file not found: ${filePath}`);
      }

      const sql = fs.readFileSync(filePath, 'utf-8');
      console.log(`[Migrator] Applying migration: ${m.name}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public._schema_migrations (name) VALUES ($1)', [m.name]);
        await client.query('COMMIT');
        console.log(`[Migrator] Successfully applied ${m.name}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrator] Failed applying ${m.name}:`, err);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('[Migrator] All migrations are already up to date (idempotent).');
    } else {
      console.log(`[Migrator] Applied ${appliedCount} new migration(s).`);
    }
  } finally {
    await client.end();
  }
}

export async function runMigrateStatus(): Promise<void> {
  const client = await getClient();
  try {
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);

    console.log('\n--- Migration Status ---');
    for (const m of MIGRATIONS) {
      const appliedAt = applied.get(m.name);
      if (appliedAt) {
        console.log(`  [APPLIED]  ${m.name.padEnd(28)} (at ${appliedAt.toISOString()})`);
      } else {
        console.log(`  [PENDING]  ${m.name.padEnd(28)}`);
      }
    }
    console.log('------------------------\n');
  } finally {
    await client.end();
  }
}

export async function runMigrateDown(): Promise<void> {
  const client = await getClient();
  try {
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);

    // Find the last applied migration
    const appliedList = Array.from(applied.keys());
    if (appliedList.length === 0) {
      console.log('[Migrator] No migrations to revert.');
      return;
    }

    const lastAppliedName = appliedList[appliedList.length - 1];
    const migration = MIGRATIONS.find((m) => m.name === lastAppliedName);

    if (!migration) {
      throw new Error(`Cannot revert unknown migration: ${lastAppliedName}`);
    }

    console.log(`[Migrator] Reverting migration: ${migration.name}...`);
    await client.query('BEGIN');
    try {
      await client.query(migration.downSql);
      await client.query('DELETE FROM public._schema_migrations WHERE name = $1', [migration.name]);
      await client.query('COMMIT');
      console.log(`[Migrator] Successfully reverted ${migration.name}.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Migrator] Failed reverting ${migration.name}:`, err);
      throw err;
    }
  } finally {
    await client.end();
  }
}

// CLI Execution entrypoint
const command = process.argv[2];
if (command === 'up') {
  runMigrateUp().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (command === 'down') {
  runMigrateDown().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (command === 'status') {
  runMigrateStatus().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
