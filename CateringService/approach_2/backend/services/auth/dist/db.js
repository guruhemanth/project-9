import pg from 'pg';
const { Pool } = pg;
export const pgPool = new Pool({
    connectionString: process.env.APP_DATABASE_URL ||
        process.env.DATABASE_URL?.includes('54322') ? process.env.DATABASE_URL : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});
