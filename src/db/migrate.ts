import * as dotenv from 'dotenv';
dotenv.config();

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  assertProductionDbConfigured,
  getDb,
  isDbConfigured,
  isProductionRuntime,
} from './index.ts';

export async function runMigrations() {
  if (isProductionRuntime()) {
    assertProductionDbConfigured();
  }
  if (!isDbConfigured()) {
    console.warn(
      '[Maestro Leave Management] Database credentials are not configured. Skipping migrations.'
    );
    return {
      success: false,
      message: 'Database not configured. Skipping migration.',
    };
  }

  const db = getDb();
  if (!db) {
    throw new Error('Database pool could not be initialized.');
  }

  console.log('[Maestro Leave Management] Applying migrations from ./drizzle ...');
  await migrate(db as any, { migrationsFolder: './drizzle' });
  console.log('[Maestro Leave Management] Migrations applied successfully.');
  return { success: true };
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then((res) => {
      console.log('Migration completed:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
