import 'server-only';
import { AppError } from '../errors';
import type { Product } from '../offers/contracts';
import { marketUrl, priceCents, productId, searchQuery } from '../offers/validation';
import { getValidAccessToken } from './tokens';

export interface SearchResult { products: Product[]; total: number; offset: number; limit: number }
function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
export function normalizeProduct(value: unknown): Product | null {
  const item = record(value); if (!item) return null;
  try {
    const id = productId(item.id); const price = priceCents(item.price) / 100;
    const permalink = marketUrl(item.permalink);
    if (item.currency_id !== 'BRL' || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300 || !permalink) return null;
    const shipping = record(item.shipping);
    const original = typeof item.original_price === 'number' && item.original_price > price ? priceCents(item.original_price) / 100 : undefined;
    return { provider: 'mercadolivre', id, name: item.title.trim(), price, currency: 'BRL', previousPrice: original,
      permalink, imageUrl: marketUrl(item.secure_thumbnail ?? item.thumbnail, true),
      shipping: shipping && typeof shipping.free_shipping === 'boolean' ? { free: shipping.free_shipping } : undefined,
      category: typeof item.category_id === 'string' && /^MLB\d{1,18}$/.test(item.category_id) ? item.category_id : undefined,
      condition: ['new', 'used', 'not_specified'].includes(String(item.condition)) ? item.condition as Product['condition'] : 'not_specified' };
  } catch { return null; }
}
export async function searchMercadoLivre(ownerHash: string, query: string, offset = 0): Promise<SearchResult> {
  const q = searchQuery(query);
  if (!Number.isInteger(offset) || offset < 0 || offset > 980 || offset % 20 !== 0) throw new AppError('SEARCH_INVALID');
  const token = await getValidAccessToken(ownerHash);
  const url = new URL('https://api.mercadolibre.com/sites/MLB/search');
  url.search = new URLSearchParams({ q, limit: '20', offset: String(offset) }).toString();
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (response.status === 403) { console.warn('MELI_SEARCH_FORBIDDEN'); throw new AppError('MELI_SEARCH_FORBIDDEN'); }
    if (response.status === 401) throw new AppError('CONNECTION_MISSING');
    if (response.status === 429) throw new AppError('SEARCH_RATE_LIMITED');
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new AppError('MELI_API_ERROR');
    const data = record(await response.json()); const paging = record(data?.paging);
    if (!data || !Array.isArray(data.results) || data.results.length > 20 || !paging || !Number.isSafeInteger(paging.total) || (paging.total as number) < 0) throw new AppError('MELI_API_ERROR');
    const unique = new Map<string, Product>();
    for (const value of data.results) { const product = normalizeProduct(value); if (product) unique.set(product.id, product); }
    if (data.results.length && !unique.size) throw new AppError('MELI_API_ERROR');
    return { products: [...unique.values()], total: paging.total as number, offset, limit: 20 };
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError('NETWORK_ERROR'); }
}
