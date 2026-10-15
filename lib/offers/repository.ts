import 'server-only';
import { getDatabase, transaction } from '../database';
import { AppError } from '../errors';
import { storageError } from '../storage-error';
import type { Product, PriceObservation } from './contracts';
import { priceCents, productId } from './validation';

export async function recordProducts(owner: string, products: Product[]): Promise<void> {
  if (!products.length) return;
  if (products.length>20 || products.some(product=>product.provider!=='mercadolivre'||product.currency!=='BRL')) throw new AppError('PRODUCT_INVALID');
  const records=JSON.stringify(products.map(product=>({product_id:productId(product.id),name:product.name,price_cents:priceCents(product.price),
    previous_price_cents:product.previousPrice?priceCents(product.previousPrice):null,permalink:product.permalink,image_url:product.imageUrl??null,
    catalog_id:product.catalogId??null,available:product.available??null,sold_quantity:product.soldQuantity??null,category:product.category??null,condition:product.condition??'not_specified',free_shipping:product.shipping?.free??null})));
  // One transaction: product metadata and observations either both persist or neither does.
  await transaction(async db => {
      // Sorted transaction locks serialize hourly collection across sessions of the same ML account.
      await db.query(`SELECT pg_advisory_xact_lock(hashtextextended(c.user_id::text||':price:'||id,0)) FROM public.meli_connections c CROSS JOIN unnest($2::text[]) AS id WHERE c.owner_hash=$1 ORDER BY id`,[owner,products.map(p=>p.id).sort()]);
      await db.query(`INSERT INTO offers.products (owner_hash,provider,product_id,name,price_cents,currency,previous_price_cents,permalink,image_url,category,condition,free_shipping,catalog_id,available,sold_quantity)
        SELECT $1,'mercadolivre',r.product_id,r.name,r.price_cents,'BRL',r.previous_price_cents,r.permalink,r.image_url,r.category,r.condition,r.free_shipping,r.catalog_id,r.available,r.sold_quantity
        FROM jsonb_to_recordset($2::jsonb) AS r(product_id text,name text,price_cents bigint,previous_price_cents bigint,permalink text,image_url text,category text,condition text,free_shipping boolean,catalog_id text,available boolean,sold_quantity bigint)
        ON CONFLICT (owner_hash,provider,product_id) DO UPDATE SET name=EXCLUDED.name,price_cents=EXCLUDED.price_cents,previous_price_cents=EXCLUDED.previous_price_cents,permalink=EXCLUDED.permalink,image_url=EXCLUDED.image_url,category=EXCLUDED.category,condition=EXCLUDED.condition,free_shipping=EXCLUDED.free_shipping,catalog_id=COALESCE(EXCLUDED.catalog_id,offers.products.catalog_id),available=EXCLUDED.available,sold_quantity=EXCLUDED.sold_quantity,updated_at=NOW()`,
        [owner,records]);
      await db.query(`INSERT INTO offers.price_observations (owner_hash,provider,product_id,bucket,price_cents,currency,condition)
        SELECT $1,'mercadolivre',r.product_id,FLOOR(EXTRACT(EPOCH FROM NOW())/3600)::bigint,r.price_cents,'BRL',r.condition
        FROM jsonb_to_recordset($2::jsonb) AS r(product_id text,price_cents bigint,condition text)
        WHERE NOT EXISTS (SELECT 1 FROM offers.price_observations h JOIN public.meli_connections hc ON hc.owner_hash=h.owner_hash JOIN public.meli_connections current ON current.owner_hash=$1
          WHERE hc.user_id=current.user_id AND h.provider='mercadolivre' AND h.product_id=r.product_id AND h.bucket=FLOOR(EXTRACT(EPOCH FROM NOW())/3600)::bigint)
        ON CONFLICT (owner_hash,provider,product_id,bucket) DO NOTHING`, [owner,records]);
  });
}

interface ObservationRow { product_id: string; price_cents: string; currency: string; observed_at: Date; condition: Product['condition'] }
export async function listPriceHistories(owner: string, ids: string[], days: 7|30|90=30): Promise<Map<string,PriceObservation[]>> {
  const result = new Map<string,PriceObservation[]>(); if (!ids.length) return result;
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try {
    const rows = await db.query<ObservationRow>(`SELECT DISTINCT ON(h.product_id,h.bucket,h.currency,h.condition) h.product_id,h.price_cents,h.currency,h.observed_at,h.condition
      FROM offers.price_observations h JOIN public.meli_connections c ON c.owner_hash=h.owner_hash
      WHERE c.user_id=(SELECT user_id FROM public.meli_connections WHERE owner_hash=$1) AND h.provider='mercadolivre' AND h.product_id=ANY($2::text[]) AND h.observed_at>=NOW()-make_interval(days=>$3)
      ORDER BY h.product_id,h.bucket,h.currency,h.condition,h.observed_at ASC`, [owner,ids.map(productId),days]);
    for (const row of rows.rows) {
      const entries = result.get(row.product_id) ?? [];
      entries.push({ provider:'mercadolivre',productId:row.product_id,price:Number(row.price_cents)/100,currency:row.currency,observedAt:row.observed_at,condition:row.condition });
      result.set(row.product_id,entries);
    }
    return result;
  } catch (error) { throw storageError(error); }
}

export async function productExists(owner: string, id: string): Promise<boolean> {
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try { const result = await db.query("SELECT 1 FROM offers.products WHERE owner_hash IN(SELECT owner_hash FROM public.meli_connections WHERE user_id=(SELECT user_id FROM public.meli_connections WHERE owner_hash=$1)) AND provider='mercadolivre' AND product_id=$2", [owner,productId(id)]); return result.rowCount === 1; }
  catch (error) { throw storageError(error); }
}
