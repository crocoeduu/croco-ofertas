import 'server-only';
import { AppError } from '../errors';
import type { Product } from '../offers/contracts';
import { marketUrl, priceCents, productId, searchQuery } from '../offers/validation';
import { getValidAccessToken } from './tokens';
import {firstProductImage} from '../offers/media';

export interface SearchResult { products: Product[]; total: number; offset: number; limit: number; source?: 'marketplace' | 'catalog'; priceCoverage?: {matches:number;active:number;winners:number;priced:number} }
type SearchResource = 'marketplace' | 'catalog_search' | 'catalog_product' | 'catalog_offers';
type AccessReason = 'POLICY_DENIED' | 'FORBIDDEN';
export class SearchAccessError extends AppError {
  constructor(readonly resource: SearchResource, readonly reason: AccessReason) { super(resource==='catalog_offers'?'MELI_PRICES_FORBIDDEN':'MELI_SEARCH_FORBIDDEN'); }
}
class SearchResourceMissingError extends AppError {
  constructor(readonly resource:SearchResource){super('PRODUCT_NOT_FOUND');}
}
function cataloguePermalink(detail:Record<string,unknown>) {
  return marketUrl(detail.permalink)??`https://www.mercadolivre.com.br/p/${productId(detail.id)}`;
}
export function searchAccessDiagnostic(error: unknown) {
  return error instanceof SearchAccessError ? { resource:error.resource,reason:error.reason } : undefined;
}
function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
async function apiJson(url: URL, token: string, resource: SearchResource, signal: AbortSignal) {
  const response = await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal});
  if(!response.ok)console.warn('MELI_API_FAILED',{resource,status:response.status});
  if(response.status===403) {
    let reason:AccessReason='FORBIDDEN';
    // Never log the provider's message/payload: only a known policy marker.
    try { const body=record(await response.json()); if(body?.blocked_by==='PolicyAgent'||body?.code==='PA_UNAUTHORIZED_RESULT_FROM_POLICIES')reason='POLICY_DENIED'; } catch { /* A generic 403 is still denied. */ }
    console.warn('MELI_SEARCH_FORBIDDEN',{resource,reason});
    throw new SearchAccessError(resource,reason);
  }
  if(response.status===401)throw new AppError('CONNECTION_MISSING');
  if(response.status===404)throw new SearchResourceMissingError(resource);
  if(response.status===429)throw new AppError('SEARCH_RATE_LIMITED');
  if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw new AppError('MELI_API_ERROR');
  const raw:unknown=await response.json();
  const data=record(raw);
  if(resource==='catalog_offers') {
    console.info('MELI_OFFERS_RESPONSE_SHAPE',{rootArray:Array.isArray(raw),resultsArray:Array.isArray(data?.results),itemsArray:Array.isArray(data?.items)});
    if(Array.isArray(raw))return {results:raw};
    if(data&&!Array.isArray(data.results)&&Array.isArray(data.items))return {...data,results:data.items};
  }
  if(!data)throw new AppError('MELI_API_ERROR');return data;
}
async function searchCatalog(token:string,q:string,offset:number,signal:AbortSignal):Promise<SearchResult> {
  const url=new URL('https://api.mercadolibre.com/products/search');
  url.search=new URLSearchParams({site_id:'MLB',status:'active',q,limit:'20',offset:String(offset)}).toString();
  const data=await apiJson(url,token,'catalog_search',signal);const paging=record(data.paging);
  if(!Array.isArray(data.results)||data.results.length>20||!paging||!Number.isSafeInteger(paging.total)||(paging.total as number)<0)throw new AppError('MELI_API_ERROR');
  const ids=data.results.map(value=>record(value)?.id).filter((id):id is string=>typeof id==='string'&&/^MLB[0-9]{6,18}$/.test(id));
  const unique=new Map<string,Product>(); let denied:SearchAccessError|undefined;
  let active=0;let winners=0;const withoutWinner:Record<string,unknown>[]=[];
  // Consult only documented catalogue resources, once per product, four at a time.
  for(let index=0;index<ids.length;index+=4) {
    const details=await Promise.all(ids.slice(index,index+4).map(async id=>{
      try {return await apiJson(new URL(`https://api.mercadolibre.com/products/${id}`),token,'catalog_product',signal);}
      catch(error){if(error instanceof SearchAccessError){denied=error;return null;}if(error instanceof SearchResourceMissingError)return null;throw error;}
    }));
    for(const detail of details) {
      if(!detail||detail.status!=='active')continue;
      active++;
      const winner=record(detail.buy_box_winner);if(!winner){withoutWinner.push(detail);continue;} // Never fabricate prices from a catalogue title.
      winners++;
      const picture=Array.isArray(detail.pictures)?record(detail.pictures[0]):undefined;
      const product=normalizeProduct({...winner,id:winner.item_id,title:detail.name,permalink:cataloguePermalink(detail),secure_thumbnail:picture?.url});
      if(product){product.catalogId=productId(detail.id);unique.set(product.id,product);}
    }
  }
  // Catalogue metadata alone is not a price. Read associated listings explicitly.
  // A denied resource stops immediately; never loop through IDs to evade a denial.
  const overflow:Product[]=[];
  for(const detail of withoutWinner) {
    if(unique.size>=20)break;
    const id=productId(detail.id);
    const url=new URL(`https://api.mercadolibre.com/products/${id}/items`);
    let offers:Record<string,unknown>;
    try{offers=await apiJson(url,token,'catalog_offers',signal);}
    catch(error){if(error instanceof SearchResourceMissingError)continue;throw error;}
    if(!Array.isArray(offers.results)||offers.results.length>100)throw new AppError('MELI_API_ERROR');
    console.info('MELI_CATALOG_OFFERS_RESULT',{
      results:offers.results.length,
      withBrl:offers.results.filter(value=>record(value)?.currency_id==='BRL').length,
      withNumericPrice:offers.results.filter(value=>typeof record(value)?.price==='number').length,
      withListingId:offers.results.filter(value=>/^MLB[0-9]{6,18}$/.test(String(record(value)?.item_id??record(value)?.id))).length,
      parentBrl:offers.currency_id==='BRL',
    });
    const picture=Array.isArray(detail.pictures)?record(detail.pictures[0]):undefined;
    let perCatalog=0;
    for(const value of offers.results) {
      const item=record(value);if(!item||(item.status!=null&&item.status!=='active')||item.available_quantity===0)continue;
      const product=normalizeProduct({...item,id:item.item_id??item.id,currency_id:item.currency_id??offers.currency_id,title:item.title??detail.name,permalink:marketUrl(item.permalink)??cataloguePermalink(detail),secure_thumbnail:item.secure_thumbnail??picture?.url});
      if(product){product.catalogId=id;if(perCatalog<4){unique.set(product.id,product);perCatalog++;}else overflow.push(product);if(unique.size>=20)break;}
    }
  }
  for(const product of overflow){if(unique.size>=20)break;if(!unique.has(product.id))unique.set(product.id,product);}
  if(!unique.size&&denied)throw denied;
  if(data.results.length&&!ids.length)throw new AppError('MELI_API_ERROR');
  const priceCoverage={matches:data.results.length,active,winners,priced:unique.size};
  console.info('MELI_CATALOG_RESULT',{total:paging.total,...priceCoverage}); // Counts only, no query/account/payload/token.
  return {products:[...unique.values()],total:paging.total as number,offset,limit:20,source:'catalog',priceCoverage};
}
export function normalizeProduct(value: unknown): Product | null {
  const item = record(value); if (!item) return null;
  try {
    const id = productId(item.id); const price = priceCents(item.price) / 100;
    const permalink = marketUrl(item.permalink);
    if (item.currency_id !== 'BRL' || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300 || !permalink) return null;
    const shipping = record(item.shipping);
    const original = typeof item.original_price === 'number' && item.original_price > price ? priceCents(item.original_price) / 100 : undefined;
    return { provider: 'mercadolivre', id, name: item.title.trim(), price, currency: 'BRL', previousPrice: original,
      permalink, imageUrl: firstProductImage(item.secure_thumbnail,item.thumbnail,...(Array.isArray(item.pictures)?item.pictures.slice(0,4):[])),
      shipping: shipping && typeof shipping.free_shipping === 'boolean' ? { free: shipping.free_shipping } : undefined,
      category: typeof item.category_id === 'string' && /^MLB\d{1,18}$/.test(item.category_id) ? item.category_id : undefined,
      available: typeof item.available_quantity==='number' && typeof item.status==='string' ? item.status==='active'&&item.available_quantity>0 : undefined,
      soldQuantity: typeof item.sold_quantity==='number' && Number.isSafeInteger(item.sold_quantity) && item.sold_quantity>=0 ? item.sold_quantity : undefined,
      catalogId:typeof item.catalog_product_id==='string'&&/^MLB[0-9]{6,18}$/.test(item.catalog_product_id)?item.catalog_product_id:undefined,
      condition: ['new', 'used', 'not_specified'].includes(String(item.condition)) ? item.condition as Product['condition'] : 'not_specified' };
  } catch { return null; }
}
export async function searchMercadoLivre(ownerHash: string, query: string, offset = 0): Promise<SearchResult> {
  const q = searchQuery(query);
  if (!Number.isInteger(offset) || offset < 0 || offset > 980 || offset % 20 !== 0) throw new AppError('SEARCH_INVALID');
  const token = await getValidAccessToken(ownerHash);
  const url = new URL('https://api.mercadolibre.com/sites/MLB/search');
  url.search = new URLSearchParams({ q, limit: '20', offset: String(offset) }).toString();
  const signal=AbortSignal.timeout(20_000);
  try {
    let data:Record<string,unknown>;
    try{data=await apiJson(url,token,'marketplace',signal);}
    catch(error){if(error instanceof SearchAccessError)return await searchCatalog(token,q,offset,signal);throw error;}
    const paging = record(data?.paging);
    if (!data || !Array.isArray(data.results) || data.results.length > 20 || !paging || !Number.isSafeInteger(paging.total) || (paging.total as number) < 0) throw new AppError('MELI_API_ERROR');
    const unique = new Map<string, Product>();
    for (const value of data.results) { const product = normalizeProduct(value); if (product) unique.set(product.id, product); }
    if (data.results.length && !unique.size) throw new AppError('MELI_API_ERROR');
    return { products: [...unique.values()], total: paging.total as number, offset, limit: 20,source:'marketplace' };
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError('NETWORK_ERROR'); }
}
export async function revalidateMercadoLivre(ownerHash:string,id:string):Promise<{product:Product;available:boolean;checkedAt:Date}> {
  const validId=productId(id);const token=await getValidAccessToken(ownerHash);
  try {
    const data=await apiJson(new URL(`https://api.mercadolibre.com/items/${validId}`),token,'marketplace',AbortSignal.timeout(10000));
    const product=normalizeProduct(data);if(!product||product.id!==validId)throw new AppError('PRODUCT_INVALID');
    return {product,available:data.status==='active'&&typeof data.available_quantity==='number'&&data.available_quantity>0,checkedAt:new Date()};
  }catch(error){if(error instanceof AppError)throw error;throw new AppError('NETWORK_ERROR');}
}
