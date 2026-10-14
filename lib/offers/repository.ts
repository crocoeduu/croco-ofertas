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
    category:product.category??null,condition:product.condition??'not_specified',free_shipping:product.shipping?.free??null})));
  // One transaction: product metadata and observations either both persist or neither does.
  await transaction(async db => {
      await db.query(`INSERT INTO offers.products (owner_hash,provider,product_id,name,price_cents,currency,previous_price_cents,permalink,image_url,category,condition,free_shipping)
        SELECT $1,'mercadolivre',r.product_id,r.name,r.price_cents,'BRL',r.previous_price_cents,r.permalink,r.image_url,r.category,r.condition,r.free_shipping
        FROM jsonb_to_recordset($2::jsonb) AS r(product_id text,name text,price_cents bigint,previous_price_cents bigint,permalink text,image_url text,category text,condition text,free_shipping boolean)
        ON CONFLICT (owner_hash,provider,product_id) DO UPDATE SET name=EXCLUDED.name,price_cents=EXCLUDED.price_cents,previous_price_cents=EXCLUDED.previous_price_cents,permalink=EXCLUDED.permalink,image_url=EXCLUDED.image_url,category=EXCLUDED.category,condition=EXCLUDED.condition,free_shipping=EXCLUDED.free_shipping,updated_at=NOW()`,
        [owner,records]);
      // At most one sample per hour/session/listing, using the database's clock.
      await db.query(`INSERT INTO offers.price_observations (owner_hash,provider,product_id,bucket,price_cents,currency,condition)
        SELECT $1,'mercadolivre',r.product_id,FLOOR(EXTRACT(EPOCH FROM NOW())/3600)::bigint,r.price_cents,'BRL',r.condition
        FROM jsonb_to_recordset($2::jsonb) AS r(product_id text,price_cents bigint,condition text)
        ON CONFLICT (owner_hash,provider,product_id,bucket) DO NOTHING`, [owner,records]);
  });
}

interface ObservationRow { product_id: string; price_cents: string; currency: string; observed_at: Date; condition: Product['condition'] }
export async function listPriceHistories(owner: string, ids: string[]): Promise<Map<string,PriceObservation[]>> {
  const result = new Map<string,PriceObservation[]>(); if (!ids.length) return result;
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try {
    const rows = await db.query<ObservationRow>(`SELECT product_id,price_cents,currency,observed_at,condition FROM offers.price_observations
      WHERE owner_hash=$1 AND provider='mercadolivre' AND product_id=ANY($2::text[]) AND observed_at>=NOW()-INTERVAL '30 days'
      ORDER BY observed_at ASC`, [owner,ids.map(productId)]);
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
  try { const result = await db.query("SELECT 1 FROM offers.products WHERE owner_hash=$1 AND provider='mercadolivre' AND product_id=$2", [owner,productId(id)]); return result.rowCount === 1; }
  catch (error) { throw storageError(error); }
}
