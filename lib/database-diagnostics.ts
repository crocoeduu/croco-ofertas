export type DatabaseDiagnostic = 'DB_AUTH_FAILED' | 'DB_TLS_FAILED' | 'DB_TIMEOUT' | 'DB_DNS_FAILED' | 'DB_SCHEMA_MISSING' | 'DB_PERMISSION_DENIED' | 'DB_QUERY_FAILED';
export function databaseDiagnostic(error: unknown): DatabaseDiagnostic {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (['28P01', '28000'].includes(code)) return 'DB_AUTH_FAILED';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DB_DNS_FAILED';
  if (['ETIMEDOUT', '57014'].includes(code)) return 'DB_TIMEOUT';
  if (['42P01', '3F000', '42703'].includes(code)) return 'DB_SCHEMA_MISSING';
  if (code === '42501') return 'DB_PERMISSION_DENIED';
  if (/^(?:ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_)/.test(code)) return 'DB_TLS_FAILED';
  // pg timeouts sometimes have no code. Inspect locally; never emit the message.
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) return 'DB_TIMEOUT';
  return 'DB_QUERY_FAILED';
}
export function reportDatabaseError(error: unknown): void {
  // Only a fixed allowlisted category leaves the server. No message, stack or payload.
  console.error(databaseDiagnostic(error));
}
