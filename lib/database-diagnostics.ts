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
  const category = databaseDiagnostic(error);
  if (category !== 'DB_AUTH_FAILED') { console.error(category); return; }
  const sqlstate = error && typeof error === 'object' && 'code' in error && ['28P01', '28000'].includes(String(error.code)) ? String(error.code) : undefined;
  // Metadata is allowlisted. The password is only inspected for common formatting
  // mistakes; its value, length, and content never leave this function.
  let target: Record<string, string | boolean | undefined> = {};
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    target = {
      host: /^[a-z0-9.-]+\.supabase\.com$/.test(url.hostname) ? url.hostname : 'OTHER_HOST',
      port: url.port || '5432',
      username: /^postgres(?:\.[a-z0-9]{20})?$/.test(username) ? username : 'INVALID_USERNAME_FORMAT',
      verifiedTlsRequested: url.searchParams.get('sslmode') === 'verify-full',
      passwordWrappedInBrackets: password.startsWith('[') && password.endsWith(']'),
      passwordHasOuterWhitespace: password.trim() !== password,
    };
  } catch { /* Never emit a parse error or its input. */ }
  console.error(category, { sqlstate, ...target });
}
