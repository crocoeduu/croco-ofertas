import { AppError } from '../errors';
export function productId(value: unknown): string {
  if (typeof value !== 'string' || !/^MLB[0-9]{6,18}$/.test(value)) throw new AppError('PRODUCT_INVALID');
  return value;
}
export function searchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new AppError('SEARCH_INVALID');
  const query = value.trim().replace(/\s+/gu, ' ');
  if (query.length < 2 || query.length > 100 || /[\p{Cc}\p{Cf}]/u.test(query)) throw new AppError('SEARCH_INVALID');
  return query;
}
export function priceCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) throw new AppError('PRODUCT_INVALID');
  const cents = Math.round(value * 100);
  if (cents < 1 || !Number.isSafeInteger(cents)) throw new AppError('PRODUCT_INVALID');
  return cents;
}
export function marketUrl(value: unknown, image = false): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    // Mercado Livre sometimes returns http permalinks; upgrade only these trusted hosts.
    const validHost = image ? url.hostname === 'http2.mlstatic.com' : ['www.mercadolivre.com.br', 'produto.mercadolivre.com.br'].includes(url.hostname);
    if (!validHost || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return undefined;
    url.protocol = 'https:'; url.hash = ''; return url.href;
  } catch { return undefined; }
}
