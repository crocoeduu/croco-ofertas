import { readFile } from 'node:fs/promises';
import pg from 'pg';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL não configurado.'); process.exit(1); }
if (process.env.NODE_ENV === 'production' && new URL(url).searchParams.get('sslmode') !== 'verify-full') {
  console.error('PostgreSQL em produção requer TLS com verificação completa.'); process.exit(1);
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
try { await client.connect(); await client.query(await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8')); console.log('Migração concluída.'); }
catch { console.error('Não foi possível executar a migração. Verifique conexão, TLS e permissões.'); process.exitCode = 1; }
finally { await client.end().catch(() => undefined); }
