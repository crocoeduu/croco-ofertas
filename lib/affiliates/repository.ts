import 'server-only';
import { getDatabase, transaction } from '../database';
import { AppError } from '../errors';
import { storageError } from '../storage-error';
import { administratorId } from './admin';
import { affiliateId, affiliateChannel, officialAffiliateUrl, type AffiliateInput, type AffiliateStatus } from './validation';
import type { AffiliateChannel, ProviderId } from '../offers/contracts';

export interface AffiliateLink {
  id: string; marketplace: ProviderId; product_id: string; original_url: string; affiliate_url: string;
  channel: AffiliateChannel; label: string; notes: string; status: AffiliateStatus;
  own_link_confirmed: boolean; provenance: 'administrator_registered'; verified_at: string | null;
  last_checked_at: string; created_at: string; updated_at: string;
}
const fields = 'id,marketplace,product_id,original_url,affiliate_url,channel,label,notes,status,own_link_confirmed,provenance,verified_at::text AS verified_at,last_checked_at::text AS last_checked_at,created_at::text AS created_at,updated_at::text AS updated_at';
export async function affiliateQuery<T extends import('pg').QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try { return (await db.query<T>(sql,values)).rows; } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new AppError('AFFILIATE_DUPLICATE');
    throw storageError(error);
  }
}
export function affiliateAccount(): string { const id=administratorId(); if (!id) throw new AppError('ADMIN_REQUIRED'); return id; }
export async function listAffiliateLinks(): Promise<AffiliateLink[]> {
  return affiliateQuery<AffiliateLink>(`SELECT ${fields} FROM offers.affiliate_links WHERE account_id=$1 ORDER BY updated_at DESC LIMIT 1000`,[affiliateAccount()]);
}
export async function findProductLinks(ids: string[]): Promise<AffiliateLink[]> {
  const account=administratorId(); if (!account || !ids.length) return [];
  return affiliateQuery<AffiliateLink>(`SELECT ${fields} FROM offers.affiliate_links WHERE account_id=$1 AND marketplace='mercadolivre' AND product_id=ANY($2::text[]) AND status='verified' AND own_link_confirmed`,[account,ids]);
}
export async function getAffiliateLink(id: string, active = false): Promise<AffiliateLink | undefined> {
  const account=administratorId(); if (!account) return;
  const [link] = await affiliateQuery<AffiliateLink>(`SELECT ${fields} FROM offers.affiliate_links WHERE id=$1 AND account_id=$2 ${active ? "AND status='verified' AND own_link_confirmed" : ''}`,[affiliateId(id),account]);
  if (link && active) officialAffiliateUrl(link.affiliate_url); // Defense even against out-of-band DB edits.
  return link;
}
export async function saveAffiliateLink(input: AffiliateInput, id?: string, expectedUpdatedAt?: string): Promise<AffiliateLink> {
  const values=[affiliateAccount(),input.marketplace,input.productId,input.originalUrl,input.affiliateUrl,input.channel,input.label,input.notes,input.status,input.ownLinkConfirmed];
  if (id && (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt)))) throw new AppError('AFFILIATE_CONFLICT');
  const rows=await affiliateQuery<AffiliateLink>(id ? `UPDATE offers.affiliate_links SET marketplace=$2,product_id=$3,original_url=$4,affiliate_url=$5,channel=$6,label=$7,notes=$8,status=$9,own_link_confirmed=$10,verified_at=CASE WHEN $9='verified' THEN NOW() ELSE NULL END,last_checked_at=NOW(),updated_at=NOW() WHERE account_id=$1 AND id=$11 AND updated_at=$12::timestamptz RETURNING ${fields}` :
    `INSERT INTO offers.affiliate_links (account_id,marketplace,product_id,original_url,affiliate_url,channel,label,notes,status,own_link_confirmed,verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $9='verified' THEN NOW() ELSE NULL END) RETURNING ${fields}`,id ? [...values,affiliateId(id),expectedUpdatedAt] : values);
  if (!rows[0]) throw new AppError('AFFILIATE_CONFLICT');
  return rows[0];
}
export async function disableAffiliateLink(id: string): Promise<void> {
  const rows=await affiliateQuery(`UPDATE offers.affiliate_links SET status='disabled',verified_at=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 RETURNING id`,[affiliateAccount(),affiliateId(id)]);
  if (!rows.length) throw new AppError('AFFILIATE_NOT_FOUND');
}
export async function importAffiliateLinks(inputs: AffiliateInput[]): Promise<void> {
  // No upsert. A concurrent duplicate aborts the whole transaction.
  await transaction(async db=> {
    for (const input of inputs) {
      try {
        await db.query(`INSERT INTO offers.affiliate_links (account_id,marketplace,product_id,original_url,affiliate_url,channel,label,notes,status,own_link_confirmed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',FALSE)`,[affiliateAccount(),input.marketplace,input.productId,input.originalUrl,input.affiliateUrl,input.channel,input.label,input.notes]);
      } catch (error) { if (error && typeof error==='object' && 'code' in error && error.code==='23505') throw new AppError('AFFILIATE_DUPLICATE'); throw error; }
    }
  });
}
export async function recordAffiliateClick(id: string, requestedChannel?: AffiliateChannel): Promise<string> {
  return transaction(async db=> {
    const result=await db.query<AffiliateLink>(`SELECT ${fields} FROM offers.affiliate_links WHERE account_id=$1 AND id=$2 AND status='verified' AND own_link_confirmed FOR SHARE`,[affiliateAccount(),affiliateId(id)]);
    const link=result.rows[0]; if (!link) throw new AppError('AFFILIATE_NOT_FOUND');
    const destination=officialAffiliateUrl(link.affiliate_url);
    const channel=requestedChannel?affiliateChannel(requestedChannel):link.channel;
    if(link.channel!=='generic'&&channel!==link.channel)throw new AppError('REQUEST_INVALID');
    await db.query('INSERT INTO offers.affiliate_clicks (affiliate_link_id,product_id,channel,campaign) VALUES ($1,$2,$3,$4)',[link.id,link.product_id,channel,link.label]);
    return destination;
  });
}
export async function affiliateDashboard() {
  const account=affiliateAccount();
  const [counts,clicks,products,channels]=await Promise.all([
    affiliateQuery<{status:AffiliateStatus;count:string}>('SELECT status,COUNT(*)::text AS count FROM offers.affiliate_links WHERE account_id=$1 GROUP BY status',[account]),
    affiliateQuery<{count:string}>(`SELECT COUNT(*)::text AS count FROM offers.affiliate_clicks c JOIN offers.affiliate_links l ON l.id=c.affiliate_link_id WHERE l.account_id=$1 AND c.clicked_at>=NOW()-INTERVAL '30 days'`,[account]),
    affiliateQuery<{product_id:string;clicks:string}>(`SELECT c.product_id,COUNT(*)::text AS clicks FROM offers.affiliate_clicks c JOIN offers.affiliate_links l ON l.id=c.affiliate_link_id WHERE l.account_id=$1 AND c.clicked_at>=NOW()-INTERVAL '30 days' GROUP BY c.product_id ORDER BY COUNT(*) DESC LIMIT 10`,[account]),
    affiliateQuery<{channel:AffiliateChannel;clicks:string}>(`SELECT c.channel,COUNT(*)::text AS clicks FROM offers.affiliate_clicks c JOIN offers.affiliate_links l ON l.id=c.affiliate_link_id WHERE l.account_id=$1 AND c.clicked_at>=NOW()-INTERVAL '30 days' GROUP BY c.channel ORDER BY COUNT(*) DESC`,[account])
  ]);
  return {counts:Object.fromEntries(counts.map(row=>[row.status,Number(row.count)])),clicks:Number(clicks[0]?.count??0),products:products.map(row=>({...row,clicks:Number(row.clicks)})),channels:channels.map(row=>({...row,clicks:Number(row.clicks)}))};
}
