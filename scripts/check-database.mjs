import pg from 'pg';
import { postgresConfig } from '../lib/postgres-config.ts';
import { reportDatabaseError } from '../lib/database-diagnostics.ts';
// Private operator command: no HTTP endpoint and no tokens or connection details.
const url = process.env.DATABASE_URL;
if (!url) { console.error('DB_CONFIG_MISSING'); process.exit(1); }
if (!/^[0-9a-fA-F]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY ?? '')) { console.error('ENCRYPTION_KEY_INVALID'); process.exit(1); }
let client;
try {
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') && new URL(url).searchParams.get('sslmode') !== 'verify-full') {
    console.error('DB_CONFIG_INVALID'); process.exit(1);
  }
  client = new pg.Client(postgresConfig(url));
  await client.connect();
  await client.query('SELECT 1');
  await client.query('SELECT 1 FROM public.rate_limit_buckets LIMIT 1');
  await client.query('SELECT owner_hash FROM public.meli_connections LIMIT 0');
  await client.query('SELECT state_hash FROM public.used_oauth_states LIMIT 0');
  console.log('DB_READY');
} catch (error) { reportDatabaseError(error); process.exitCode = 1; }
finally { await client?.end().catch(() => undefined); }
