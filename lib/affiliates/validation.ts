import { AppError } from '../errors';
import type { AffiliateChannel, ProviderId } from '../offers/contracts';

export type AffiliateStatus = 'verified' | 'pending' | 'invalid' | 'disabled';
export interface AffiliateInput {
  marketplace: ProviderId; productId: string; originalUrl: string; affiliateUrl: string;
  channel: AffiliateChannel; label: string; notes: string; status: AffiliateStatus; ownLinkConfirmed: boolean;
}
export const channels: AffiliateChannel[] = ['site','whatsapp','instagram','telegram','generic'];
export function affiliateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AppError('AFFILIATE_NOT_FOUND');
  return value.toLowerCase();
}
export function campaignLabel(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{0,64}$/.test(value)) throw new AppError('AFFILIATE_INVALID');
  return value;
}
export function affiliateChannel(value: unknown): AffiliateChannel {
  if (!channels.includes(value as AffiliateChannel)) throw new AppError('AFFILIATE_INVALID');
  return value as AffiliateChannel;
}
function httpsUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value || /[\\\s]/.test(value) || [...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)) throw new AppError('AFFILIATE_INVALID');
  let url: URL; try { url = new URL(value); } catch { throw new AppError('AFFILIATE_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new AppError('AFFILIATE_INVALID');
  return url;
}
export function officialAffiliateUrl(value: unknown): string {
  const url = httpsUrl(value);
  // Accept only the official short-link form, never a normal listing with invented parameters.
  if (!['mercadolivre.com','www.mercadolivre.com','mercadolivre.com.br','www.mercadolivre.com.br'].includes(url.hostname) || !/^\/sec\/[A-Za-z0-9]{6,40}$/.test(url.pathname) || url.search) throw new AppError('AFFILIATE_INVALID');
  return value as string; // Keep the administrator's exact official URL intact.
}
export function originalProductUrl(value: unknown, id: string): string {
  const url = httpsUrl(value);
  if (!['www.mercadolivre.com.br','mercadolivre.com.br','produto.mercadolivre.com.br'].includes(url.hostname)) throw new AppError('AFFILIATE_INVALID');
  const match = url.pathname.match(/\/p\/(MLB[0-9]{6,18})(?:\/|$)/) ?? url.pathname.match(/\/(MLB)-([0-9]{6,18})(?:-|\/|$)/);
  const urlId = match?.length === 3 ? match[1]+match[2] : match?.[1];
  if (urlId !== id) throw new AppError('AFFILIATE_INVALID');
  return value as string;
}
export function validateAffiliate(body: Record<string, unknown>): AffiliateInput {
  const keys = ['marketplace','product_id','original_url','affiliate_url','channel','label','notes','status','own_link_confirmed','updated_at'];
  if (Object.keys(body).some(key=>!keys.includes(key)) || body.marketplace !== 'mercadolivre' || typeof body.product_id !== 'string' || !/^MLB[0-9]{6,18}$/.test(body.product_id)) throw new AppError('AFFILIATE_INVALID');
  const status = body.status ?? 'pending';
  if (!['verified','pending','invalid','disabled'].includes(status as string) || (status === 'verified' && body.own_link_confirmed !== true)) throw new AppError('AFFILIATE_INVALID');
  const notes = body.notes ?? ''; if (typeof notes !== 'string' || notes.length > 1000 || [...notes].some(char=>char.charCodeAt(0)<9)) throw new AppError('AFFILIATE_INVALID');
  return { marketplace:'mercadolivre', productId:body.product_id, originalUrl:originalProductUrl(body.original_url,body.product_id), affiliateUrl:officialAffiliateUrl(body.affiliate_url),
    channel:affiliateChannel(body.channel),label:campaignLabel(body.label ?? ''),notes,status:status as AffiliateStatus,ownLinkConfirmed:body.own_link_confirmed === true };
}
export function affiliateKey(link: Pick<AffiliateInput,'marketplace'|'productId'|'channel'|'label'>): string { return [link.marketplace,link.productId,link.channel,link.label].join(':'); }
