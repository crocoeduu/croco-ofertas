import 'server-only';
import type { Pool } from 'pg';
import { getDatabase } from './database';
import { storageError } from './storage-error';
// Cache only readiness, never credentials/tokens. A failed check is retryable.
const checks = new WeakMap<Pool, Promise<void>>();
export async function verifyDatabase(): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  const current = checks.get(db);
  if (current) return current;
  const check = (async () => {
    try {
      await db.query('SELECT 1');
      await db.query('SELECT 1 FROM public.rate_limit_buckets LIMIT 1');
      await db.query('SELECT state_hash, expires_at FROM public.used_oauth_states LIMIT 0');
      await db.query('SELECT owner_hash, user_id, access_token, refresh_token, expires_at, scope, session_expires_at, updated_at FROM public.meli_connections LIMIT 0');
      console.info('DB_READY');
    } catch (error) {
      throw storageError(error);
    }
  })();
  checks.set(db, check);
  try { await check; } catch (error) { checks.delete(db); throw error; }
}
