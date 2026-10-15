import { AppError } from '../errors';
import type { AffiliateChannel, ProviderId } from '../offers/contracts';

export type AffiliateStatus = 'verified' | 'pending' | 'invalid' | 'disabled';
export interface AffiliateInput {
  marketplace: ProviderId; productId: string; originalUrl: string; affiliateUrl: string;
  channel: AffiliateChannel; label: string; notes: string; status: AffiliateStatus; ownLinkConfirmed: boolean; source?: 'generator' | 'affiliate_bar' | 'other';
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
function httpsUrl(value: unknown, allowHash=false): URL {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value || /[\\\s]/.test(value) || [...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)) throw new AppError('AFFILIATE_INVALID');
  let url: URL; try { url = new URL(value); } catch { throw new AppError('AFFILIATE_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || (!allowHash&&url.hash)) throw new AppError('AFFILIATE_INVALID');
  return url;
}
export function officialAffiliateUrl(value: unknown): string {
  const url = httpsUrl(value);
  // Syntax only. Ownership and product binding require a separate administrator declaration.
  const meliLa = /^https:\/\/meli\.la\/[A-Za-z0-9]{6,40}$/.test(value as string);
  const sec = ['mercadolivre.com','www.mercadolivre.com','mercadolivre.com.br','www.mercadolivre.com.br'].includes(url.hostname) && /^\/sec\/[A-Za-z0-9]{6,40}$/.test(url.pathname);
  if ((!meliLa && !sec) || url.search) throw new AppError('AFFILIATE_INVALID');
  return value as string; // Keep the administrator's exact official URL intact.
}
// A product binding is evidence about the destination, never proof of affiliate ownership.
function itemBindings(url:URL):string[] {
 const ids:string[]=[];
 for(const params of [url.searchParams,new URLSearchParams(url.hash.slice(1))]){
  const wid=params.getAll('wid');if(wid.length>1)throw new AppError('AFFILIATE_INVALID');
  for(const id of wid){if(!/^MLB[0-9]{6,18}$/.test(id))throw new AppError('AFFILIATE_INVALID');ids.push(id);}
  const filters=params.getAll('pdp_filters');if(filters.length>1)throw new AppError('AFFILIATE_INVALID');
  for(const filter of filters){const matches=[...filter.matchAll(/(?:^|[|,])item_id:(MLB[0-9]{6,18})(?=$|[|,])/g)];if(!matches.length&&filter.includes('item_id'))throw new AppError('AFFILIATE_INVALID');ids.push(...matches.map(m=>m[1]));}
 }
 return ids;
}
export function originalProductUrl(value: unknown, id: string, trustedCatalogId?:string): string {
 const url=httpsUrl(value,true);
 if(!['www.mercadolivre.com.br','mercadolivre.com.br','produto.mercadolivre.com.br'].includes(url.hostname))throw new AppError('AFFILIATE_INVALID');
 const bindings=itemBindings(url);if(bindings.some(binding=>binding!==id))throw new AppError('AFFILIATE_INVALID');
 const listing=url.pathname.match(/\/(MLB)-([0-9]{6,18})(?:-|\/|$)/);
 if(listing&&listing[1]+listing[2]!==id)throw new AppError('AFFILIATE_INVALID');
 const catalog=url.pathname.match(/\/p\/(MLB[0-9]{6,18})(?:\/|$)/)?.[1];
 const isProduct=/\/up\/MLBU[0-9]{6,18}(?:\/|$)/.test(url.pathname)||!!catalog||!!listing;
 if(!isProduct||(!bindings.length&&!listing&&catalog!==id&&catalog!==trustedCatalogId))throw new AppError('AFFILIATE_INVALID');
 return value as string;
}
export function registeredAffiliateUrl(value:unknown,id:string,status:AffiliateStatus,trustedCatalogId?:string):string {
 try{return officialAffiliateUrl(value);}catch{
  // Complete links exist officially, but no public documentation confirms attribution for
  // arbitrary product-page parameters. Preserve such submissions pending, never monetize them.
  if(status==='verified')throw new AppError('AFFILIATE_INVALID');
  return originalProductUrl(value,id,trustedCatalogId);
 }
}
export function validateAffiliate(body: Record<string, unknown>, trustedCatalogId?:string): AffiliateInput {
  const keys = ['marketplace','product_id','original_url','affiliate_url','channel','label','notes','status','own_link_confirmed','updated_at','source'];
  if (Object.keys(body).some(key=>!keys.includes(key)) || body.marketplace !== 'mercadolivre' || typeof body.product_id !== 'string' || !/^MLB[0-9]{6,18}$/.test(body.product_id)) throw new AppError('AFFILIATE_INVALID');
  const source=body.source??'other';
  if(!['generator','affiliate_bar','other'].includes(source as string))throw new AppError('AFFILIATE_INVALID');
  const status = body.status ?? 'pending';
  if (!['verified','pending','invalid','disabled'].includes(status as string) || (status === 'verified' && body.own_link_confirmed !== true)) throw new AppError('AFFILIATE_INVALID');
  const notes = body.notes ?? ''; if (typeof notes !== 'string' || notes.length > 1000 || [...notes].some(char=>char.charCodeAt(0)<9)) throw new AppError('AFFILIATE_INVALID');
  return { marketplace:'mercadolivre', productId:body.product_id, originalUrl:originalProductUrl(body.original_url,body.product_id,trustedCatalogId), affiliateUrl:registeredAffiliateUrl(body.affiliate_url,body.product_id,status as AffiliateStatus,trustedCatalogId),
    channel:affiliateChannel(body.channel),label:campaignLabel(body.label ?? ''),notes,status:status as AffiliateStatus,ownLinkConfirmed:body.own_link_confirmed === true,source:source as AffiliateInput['source'] };
}
export function affiliateKey(link: Pick<AffiliateInput,'marketplace'|'productId'|'channel'|'label'>): string { return [link.marketplace,link.productId,link.channel,link.label].join(':'); }
