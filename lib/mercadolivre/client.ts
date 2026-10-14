import 'server-only';
import { AppError } from '../errors';
import { getValidAccessToken } from './tokens';
import type { MercadoLivreUser } from './types';
// Backend-only. No public endpoint exposes this account data.
export async function getMercadoLivreUser(ownerHash: string): Promise<MercadoLivreUser> {
  const token = await getValidAccessToken(ownerHash);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (response.status === 429) throw new AppError('RATE_LIMITED');
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new AppError('TOKEN_ENDPOINT_ERROR');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') throw new AppError('TOKEN_ENDPOINT_ERROR');
    const u = data as Record<string, unknown>;
    if (!Number.isSafeInteger(u.id) || (u.id as number) <= 0 || typeof u.nickname !== 'string' || u.nickname.length > 200 || typeof u.site_id !== 'string' || !/^[A-Z]{3}$/.test(u.site_id)) throw new AppError('TOKEN_ENDPOINT_ERROR');
    return { id: u.id as number, nickname: u.nickname, site_id: u.site_id };
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError('NETWORK_ERROR'); }
  finally { clearTimeout(timeout); }
}
