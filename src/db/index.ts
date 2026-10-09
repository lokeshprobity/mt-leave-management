import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
  var _drizzleDb: NodePgDatabase<typeof schema> | undefined;
  var _customTestDrizzleDb: NodePgDatabase<typeof schema> | undefined;
}

export const REQUIRED_PRODUCTION_DB_ENV_VARS = [
  'SQL_HOST',
  'SQL_DB_NAME',
  'SQL_USER',
  'SQL_PASSWORD',
] as const;

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getMissingProductionDbEnvVars(): string[] {
  return REQUIRED_PRODUCTION_DB_ENV_VARS.filter((key) => {
    const val = process.env[key];
    return typeof val !== 'string' || val.trim().length === 0;
  });
}

export function isDbConfigured(): boolean {
  if (global._customTestDrizzleDb) {
    return true;
  }
  if (isProductionRuntime()) {
    return getMissingProductionDbEnvVars().length === 0;
  }
  const host = process.env.SQL_HOST;
  const dbName = process.env.SQL_DB_NAME;
  const user = process.env.SQL_USER;
  return Boolean(host && dbName && user);
}

export function assertProductionDbConfigured(): void {
  if (!isProductionRuntime()) {
    return;
  }
  if (global._customTestDrizzleDb) {
    return;
  }
  const missing = getMissingProductionDbEnvVars();
  if (missing.length > 0) {
    throw new Error(
      `[Production Database Error] Missing required PostgreSQL environment variable(s): ${missing.join(
        ', '
      )}. Production runtime requires PostgreSQL and strictly prohibits demo/in-memory/JSON fallback.`
    );
  }
}

export function setCustomDbInstance(db: NodePgDatabase<typeof schema> | null): void {
  global._customTestDrizzleDb = db ?? undefined;
}

export async function resetDatabasePool(): Promise<void> {
  global._drizzleDb = undefined;
  if (global._postgresPool) {
    try {
      await global._postgresPool.end();
    } catch {}
    global._postgresPool = undefined;
  }
}

/**
 * Creates or retrieves the cached PostgreSQL connection pool using the Object Method.
 * Does NOT eagerly connect on module load (lazy pooling).
 */
export const createPool = (): Pool | null => {
  if (isProductionRuntime()) {
    assertProductionDbConfigured();
  }
  if (!isDbConfigured()) {
    return null;
  }

  if (!global._postgresPool) {
    const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432;
    global._postgresPool = new Pool({
  host: process.env.SQL_HOST,
  port: Number.isFinite(port) && port > 0 ? port : 5432,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false },
  max: 10,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }

  return global._postgresPool;
};

/**
 * Returns the Drizzle ORM database instance if PostgreSQL is configured.
 * In NODE_ENV=production, throws a clear error if PostgreSQL is not configured.
 */
export const getDb = (): NodePgDatabase<typeof schema> | null => {
  if (global._customTestDrizzleDb) {
    return global._customTestDrizzleDb;
  }
  if (isProductionRuntime()) {
    assertProductionDbConfigured();
  }
  if (!isDbConfigured()) {
    return null;
  }

  if (!global._drizzleDb) {
    const pool = createPool();
    if (!pool) return null;
    global._drizzleDb = drizzle(pool, { schema });
  }

  return global._drizzleDb;
};

/**
 * Verifies live PostgreSQL database connectivity.
 * Required at server startup in NODE_ENV=production.
 */
export async function verifyProductionDatabaseConnectivity(): Promise<void> {
  if (isProductionRuntime()) {
    assertProductionDbConfigured();
  }
  const db = getDb();
  if (!db) {
    throw new Error(
      '[Production Database Error] PostgreSQL database connection pool could not be initialized.'
    );
  }
  try {
    await db.execute(sql`SELECT 1 AS connected`);
  } catch (err: any) {
    throw new Error(
      `[Production Database Error] Failed to connect to PostgreSQL (${process.env.SQL_HOST || 'custom'}/${
        process.env.SQL_DB_NAME || 'db'
      }): ${err?.message || err}`
    );
  }
}

export const verifyDatabaseConnectivity = verifyProductionDatabaseConnectivity;

export { schema };
