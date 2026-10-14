import 'server-only';
import { AppError } from './errors';
export type EnvSource = Record<string, string | undefined>;
export interface OAuthEnv { clientId: string; clientSecret: string; redirectUri: string; secure: boolean }
export function getOAuthEnv(source: EnvSource = process.env): OAuthEnv {
  const clientId = source.MELI_CLIENT_ID;
  const clientSecret = source.MELI_CLIENT_SECRET;
  const redirectUri = source.MELI_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new AppError('ENV_MISSING');
  if (!/^\d{1,30}$/.test(clientId) || clientSecret.length > 4096 || clientSecret.trim() !== clientSecret) throw new AppError('ENV_INVALID');
  let url: URL;
  try { url = new URL(redirectUri); } catch { throw new AppError('ENV_INVALID'); }
  const local = source.NODE_ENV !== 'production' && source.VERCEL !== '1' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/api/mercadolivre/callback' || url.href !== redirectUri) throw new AppError('ENV_INVALID');
  return { clientId, clientSecret, redirectUri, secure: url.protocol === 'https:' };
}
export function getStorageEnv(source: EnvSource = process.env) {
  if (!source.DATABASE_URL) return null;
  const key = source.TOKEN_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) throw new AppError(key ? 'ENV_INVALID' : 'ENV_MISSING');
  let url: URL;
  try { url = new URL(source.DATABASE_URL); } catch { throw new AppError('ENV_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new AppError('ENV_INVALID');
  if ((source.NODE_ENV === 'production' || source.VERCEL === '1') && url.searchParams.get('sslmode') !== 'verify-full') throw new AppError('ENV_INVALID');
  return { databaseUrl: source.DATABASE_URL, key: Buffer.from(key, 'hex') };
}
