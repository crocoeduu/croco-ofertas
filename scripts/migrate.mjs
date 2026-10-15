import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import {runMigrations} from './migration-runner.mjs';
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
  const folder=new URL('../supabase/migrations/',import.meta.url);
  const files=(await readdir(folder)).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrations=await Promise.all(files.map(async file=>({version:file.slice(0,14),sql:await readFile(new URL(file,folder),'utf8')})));
  await runMigrations(client,await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8'),migrations);
  console.log('Migração concluída.');
} catch (error) { reportDatabaseError(error); process.exitCode = 1; }
finally { await client?.end().catch(() => undefined); }
