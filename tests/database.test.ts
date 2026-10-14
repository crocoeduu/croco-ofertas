import { it, expect, vi } from 'vitest';
import { Client } from 'pg';
import { checkServerIdentity, rootCertificates } from 'node:tls';
import { postgresConfig } from '@/lib/postgres-config';
import { SUPABASE_ROOT_CA_2021 } from '@/lib/supabase-ca';
import { databaseDiagnostic, reportDatabaseError } from '@/lib/database-diagnostics';
it('pg mantém CA, TLS e hostname após interpretar a URL original verify-full', () => {
  const original = 'postgres://localhost/db?sslmode=verify-full&application_name=unit-test';
  const client = new Client(postgresConfig(original));
  const parsed = (client as unknown as { connectionParameters: { ssl: { ca: string[]; rejectUnauthorized: boolean; checkServerIdentity: typeof checkServerIdentity }; application_name: string } }).connectionParameters;
  expect(parsed.ssl.rejectUnauthorized).toBe(true);
  expect(parsed.ssl.ca).toContain(SUPABASE_ROOT_CA_2021);
  expect(parsed.ssl.ca).toContain(rootCertificates[0]);
  expect(parsed.ssl.checkServerIdentity).toBe(checkServerIdentity);
  expect(parsed.application_name).toBe('unit-test');
  expect(parsed.ssl.checkServerIdentity('wrong.example', { subject: { CN: 'db.example' } } as Parameters<typeof checkServerIdentity>[1])).toHaveProperty('code', 'ERR_TLS_CERT_ALTNAME_INVALID');
});
it('parâmetros SSL não podem substituir as opções nem carregar arquivos locais', () => {
  const config = postgresConfig('postgres://localhost/db?sslmode=verify-full&sslrootcert=/missing&sslcert=/missing&sslkey=/missing&ssl=0&uselibpqcompat=true&sslnegotiation=direct');
  expect(new URL(config.connectionString!).search).toBe('');
  expect(new Client(config)).toBeInstanceOf(Client);
  expect(config.ssl).toHaveProperty('rejectUnauthorized', true);
});
it.each([
  ['28P01','DB_AUTH_FAILED'], ['28000','DB_AUTH_FAILED'], ['EAI_AGAIN','DB_DNS_FAILED'],
  ['ETIMEDOUT','DB_TIMEOUT'], ['42P01','DB_SCHEMA_MISSING'], ['42501','DB_PERMISSION_DENIED'],
  ['SELF_SIGNED_CERT_IN_CHAIN','DB_TLS_FAILED'], ['ERR_TLS_CERT_ALTNAME_INVALID','DB_TLS_FAILED'],
  ['arbitrary-secret-code','DB_QUERY_FAILED']
])('diagnóstico %s não expõe causa nem payload', (code, expected) => {
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const error = Object.assign(new Error('password token connection-string'), { code });
  expect(databaseDiagnostic(error)).toBe(expected);
  reportDatabaseError(error);
  expect(logger).toHaveBeenCalledExactlyOnceWith(expected);
  logger.mockRestore();
});
