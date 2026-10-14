import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { postgresConfig } from '../lib/postgres-config.ts';
import { reportDatabaseError } from '../lib/database-diagnostics.ts';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DB_CONFIG_MISSING'); process.exit(1); }
let client;
try {
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') && new URL(url).searchParams.get('sslmode') !== 'verify-full') {
    console.error('DB_CONFIG_INVALID'); process.exit(1);
  }
  client = new pg.Client(postgresConfig(url));
  await client.connect();
  await client.query(await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8'));
  console.log('Migração concluída.');
} catch (error) { reportDatabaseError(error); process.exitCode = 1; }
finally { await client?.end().catch(() => undefined); }
