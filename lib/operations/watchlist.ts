import 'server-only';
import {AppError} from '../errors';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {affiliateId} from '../affiliates/validation';
import {productId,priceCents} from '../offers/validation';
import {getSettings,storedProducts} from './repository';
import type {StoredProduct} from './repository';
import type {OfferScore} from '../offers/scoring';
import type {AffiliateResolution} from '../offers/contracts';
export interface WatchRow {id:string;product_id:string;target_cents:string|null;minimum_drop:number;minimum_score:number;free_shipping:boolean;active:boolean;baseline_cents:string;last_checked_at:string|null;last_error_code:string|null;failures:number;last_score?:number|null;last_available?:boolean|null;last_price_cents?:string|null}
export async function listWatchlist(){return affiliateQuery<WatchRow>(`SELECT id,product_id,target_cents,minimum_drop,minimum_score,free_shipping,active,baseline_cents,last_checked_at::text,last_error_code,failures,last_score,last_available,last_price_cents FROM offers.watchlist WHERE account_id=$1 ORDER BY created_at DESC LIMIT 200`,[affiliateAccount()]);}
export function watchSettings(body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['product_id','target','minimumDrop','minimumScore','freeShipping','active'].includes(k)))throw new AppError('REQUEST_INVALID');
 const id=productId(body.product_id);const target=body.target===null||body.target===undefined?null:priceCents(body.target);
 const drop=body.minimumDrop??5,score=body.minimumScore??60,free=body.freeShipping??false,active=body.active??true;
 if(typeof drop!=='number'||!Number.isInteger(drop)||drop<1||drop>90||typeof score!=='number'||!Number.isInteger(score)||score<0||score>100||typeof free!=='boolean'||typeof active!=='boolean')throw new AppError('REQUEST_INVALID');
 return {id,target,drop,score,free,active};
}
export async function saveWatch(body:Record<string,unknown>){
 const settings=await getSettings();if(!settings.watchlistEnabled)throw new AppError('REQUEST_FORBIDDEN');
 const v=watchSettings(body);const [product]=await storedProducts([v.id]);if(!product)throw new AppError('PRODUCT_NOT_FOUND');
 const rows=await affiliateQuery(`INSERT INTO offers.watchlist(account_id,product_id,target_cents,minimum_drop,minimum_score,free_shipping,active,baseline_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(account_id,marketplace,product_id) DO UPDATE SET target_cents=EXCLUDED.target_cents,minimum_drop=EXCLUDED.minimum_drop,minimum_score=EXCLUDED.minimum_score,free_shipping=EXCLUDED.free_shipping,active=EXCLUDED.active,failures=0,last_error_code=NULL,next_check_at=NOW(),updated_at=NOW() RETURNING id`,[affiliateAccount(),v.id,v.target,v.drop,v.score,v.free,v.active,priceCents(product.price)]);
 return rows[0];
}
export function watchEvents(watch:WatchRow,product:StoredProduct,scoring:OfferScore,affiliate:AffiliateResolution):string[]{
 const events:string[]=[];
 if(watch.last_available===false&&product.available===true)events.push('restocked');
 if(watch.last_score!==null&&watch.last_score!==undefined&&scoring.score>=watch.last_score+10)events.push('score');
 if(product.available===false)events.push('unavailable');
 else {
  if(watch.target_cents!==null&&product.price*100<=Number(watch.target_cents))events.push('target');
  if(product.price*100<=Number(watch.baseline_cents)*(1-watch.minimum_drop/100))events.push('drop');
  if(scoring.sufficientHistory&&scoring.score>=watch.minimum_score&&(!watch.free_shipping||product.shipping?.free===true))events.push('opportunity');
 }
 if(affiliate.status==='affiliate_pending')events.push('affiliate_pending');return events;
}
export async function notifyWatch(watch:WatchRow,product:StoredProduct,scoring:OfferScore,affiliate:AffiliateResolution){
 for(const kind of watchEvents(watch,product,scoring,affiliate))await affiliateQuery(`INSERT INTO offers.notifications(account_id,product_id,kind,event_key) VALUES($1,$2,$3,$4) ON CONFLICT(account_id,event_key) DO NOTHING`,[affiliateAccount(),product.id,kind,`${product.id}:${kind}:${Math.round(product.price*100)}:${new Date().toISOString().slice(0,10)}`]);
 await affiliateQuery('UPDATE offers.watchlist SET last_score=$3,last_available=$4,last_price_cents=$5 WHERE account_id=$1 AND id=$2',[affiliateAccount(),watch.id,scoring.score,product.available??null,Math.round(product.price*100)]);
}
export async function notifications(){return affiliateQuery<{id:string;product_id:string;kind:string;read_at:string|null;created_at:string}>(`SELECT id,product_id,kind,read_at::text,created_at::text FROM offers.notifications WHERE account_id=$1 ORDER BY created_at DESC LIMIT 50`,[affiliateAccount()]);}
export async function markRead(id:unknown){await affiliateQuery('UPDATE offers.notifications SET read_at=NOW() WHERE account_id=$1 AND id=$2',[affiliateAccount(),affiliateId(id)]);}
