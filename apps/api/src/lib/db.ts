import { Pool } from 'pg';

// Shared Postgres pool. Default max is 10; DB_POOL_MAX exists so the topic's
// race experiment can be repeated with a different pool size.
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://postgres:playground@localhost:5432/playground',
  max: Number(process.env.DB_POOL_MAX ?? 10),
});
