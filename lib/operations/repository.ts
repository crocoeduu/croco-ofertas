import 'server-only';
import { affiliateAccount, affiliateQuery } from '../affiliates/repository';
import { effectiveSettings, validateSettings } from './policy';
import type { Product } from '../offers/contracts';
import { productId } from '../offers/validation';
export async function getSettings(){const [row]=await affiliateQuery<{config:Record<string,unknown>}>(`SELECT config FROM offers.settings WHERE account_id=$1`,[affiliateAccount()]);return effectiveSettings(row?.config??{});}
export async function saveSettings(body:Record<string,unknown>){const settings=validateSettings(body);await affiliateQuery(`INSERT INTO offers.settings(account_id,config) VALUES($1,$2::jsonb) ON CONFLICT(account_id) DO UPDATE SET config=EXCLUDED.config,updated_at=NOW()`,[affiliateAccount(),JSON.stringify(settings)]);return effectiveSettings(settings);}
export interface StoredProduct extends Product {updatedAt:string; available?:boolean; ownerHash?:string}
type ProductRow={product_id:string;name:string;price_cents:string;previous_price_cents:string|null;permalink:string;image_url:string|null;category:string|null;condition:Product['condition'];free_shipping:boolean|null;catalog_id:string|null;available:boolean|null;sold_quantity:string|null;updated_at:Date};
export async function storedProducts(ids?:string[]):Promise<StoredProduct[]> {
 const rows=await affiliateQuery<ProductRow>(`SELECT DISTINCT ON(p.product_id) p.* FROM offers.products p JOIN public.meli_connections c ON c.owner_hash=p.owner_hash WHERE c.user_id=$1 AND p.provider='mercadolivre' ${ids?'AND p.product_id=ANY($2::text[])':''} ORDER BY p.product_id,p.updated_at DESC LIMIT 300`,ids?[affiliateAccount(),ids.map(productId)]:[affiliateAccount()]);
 return rows.map(p=>({provider:'mercadolivre',id:p.product_id,name:p.name,price:Number(p.price_cents)/100,previousPrice:p.previous_price_cents?Number(p.previous_price_cents)/100:undefined,currency:'BRL',permalink:p.permalink,imageUrl:p.image_url??undefined,category:p.category??undefined,condition:p.condition,shipping:p.free_shipping===null?undefined:{free:p.free_shipping},catalogId:p.catalog_id??undefined,available:p.available??undefined,soldQuantity:p.sold_quantity===null?undefined:Number(p.sold_quantity),updatedAt:p.updated_at.toISOString()}));
}
export async function auditRows(){return affiliateQuery<{entity:string;action:string;created_at:string}>('SELECT entity,action,created_at::text FROM offers.audit_log WHERE account_id=$1 ORDER BY created_at DESC LIMIT 30',[affiliateAccount()]);}
