import { checkServerIdentity, rootCertificates } from 'node:tls';
import type { PoolConfig } from 'pg';
import { SUPABASE_ROOT_CA_2021 } from './supabase-ca.ts';

// Shared by the backend and private migration/verification scripts. Contains no secrets.
export function postgresConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('DB_CONFIG_INVALID');
  // pg parses these AFTER merging Pool options and would replace the explicit ssl object.
  // The URL is never logged; credentials and all non-TLS parameters are preserved.
  for (const parameter of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslnegotiation', 'uselibpqcompat']) url.searchParams.delete(parameter);
  return {
    connectionString: url.href,
    ssl: {
      // An explicit CA replaces Node's default roots. Retain public roots for shared
      // poolers as well as Supabase's official private root for database endpoints.
      ca: [...rootCertificates, SUPABASE_ROOT_CA_2021],
      rejectUnauthorized: true,
      checkServerIdentity,
      minVersion: 'TLSv1.2',
    },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 15000,
  };
}
