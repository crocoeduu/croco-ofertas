import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { getStorageEnv } from './env';
import { AppError } from './errors';
import { postgresConfig } from './postgres-config';
import { reportDatabaseError } from './database-diagnostics';
import { storageError } from './storage-error';
let pool: Pool | undefined;
export function getDatabase(): Pool | null {
  const config = getStorageEnv();
  if (!config) return null;
  // Only the connection pool is reused. Tokens never live in module/global state.
  if (!pool) {
    pool = new Pool({
      ...postgresConfig(config.databaseUrl),
      max: 3,
    });
    // Idle connection failures must not become unhandled exceptions or print DB details.
    pool.on('error', reportDatabaseError);
  }
  return pool;
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const db = getDatabase();
  if (!db) throw new AppError('STORAGE_ERROR');
  let client: PoolClient;
  try { client = await db.connect(); } catch (error) { throw storageError(error); }
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw storageError(error);
  } finally { client.release(); }
}
