import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OAuthEnv } from '../env';
import { AppError } from '../errors';
import type { OAuthTokenResponse } from './types';
export const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';
export const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
export function generateState() { return randomBytes(32).toString('base64url'); }
export function codeChallenge(verifier: string) { return createHash('sha256').update(verifier).digest('base64url'); }
export function generatePKCE() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: codeChallenge(verifier) };
}
export function validState(original: string | undefined, received: string | null): boolean {
  if (!original || !received || !/^[A-Za-z0-9_-]{43}$/.test(original) || !/^[A-Za-z0-9_-]{43}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(original), Buffer.from(received));
}
export function authorizationUrl(env: OAuthEnv, state: string, challenge: string) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({ response_type: 'code', client_id: env.clientId, redirect_uri: env.redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return url;
}
export function validateTokenResponse(data: unknown): OAuthTokenResponse {
  if (!data || typeof data !== 'object') throw new AppError('TOKEN_ENDPOINT_ERROR');
  const t = data as Record<string, unknown>;
  const token = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 8192 && !/\s/.test(x) && [...x].every(char => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127);
  if (!token(t.access_token) || !token(t.refresh_token) || typeof t.token_type !== 'string' || t.token_type.toLowerCase() !== 'bearer' || !Number.isSafeInteger(t.expires_in) || (t.expires_in as number) <= 0 || (t.expires_in as number) > 31_536_000 || !Number.isSafeInteger(t.user_id) || (t.user_id as number) <= 0 || typeof t.scope !== 'string' || t.scope.length > 2048) throw new AppError('TOKEN_ENDPOINT_ERROR');
  return { access_token: t.access_token as string, refresh_token: t.refresh_token as string, token_type: 'bearer', expires_in: t.expires_in as number, user_id: t.user_id as number, scope: t.scope };
}
export async function postToken(body: URLSearchParams, fetcher: typeof fetch = fetch): Promise<OAuthTokenResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body, signal: controller.signal, cache: 'no-store', redirect: 'error' });
    if (response.status === 429) throw new AppError('RATE_LIMITED');
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new AppError('TOKEN_ENDPOINT_ERROR');
    const raw = await response.text();
    if (raw.length > 65_536) throw new AppError('TOKEN_ENDPOINT_ERROR');
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new AppError('TOKEN_ENDPOINT_ERROR'); }
    return validateTokenResponse(data);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK_ERROR');
  } finally { clearTimeout(timeout); }
}
export function exchangeCode(env: OAuthEnv, code: string, verifier: string, fetcher?: typeof fetch) {
  return postToken(new URLSearchParams({ grant_type: 'authorization_code', client_id: env.clientId, client_secret: env.clientSecret, code, redirect_uri: env.redirectUri, code_verifier: verifier }), fetcher);
}
export function refreshMercadoLivreToken(env: OAuthEnv, refreshToken: string, fetcher?: typeof fetch) {
  return postToken(new URLSearchParams({ grant_type: 'refresh_token', client_id: env.clientId, client_secret: env.clientSecret, refresh_token: refreshToken }), fetcher);
}
