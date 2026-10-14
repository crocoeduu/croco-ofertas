import type { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { digest } from '@/lib/crypto';
import { requireAdministrator } from '@/lib/affiliates/admin';
import { affiliateAccount, affiliateQuery, importAffiliateLinks, type AffiliateLink } from '@/lib/affiliates/repository';
import { affiliateKey } from '@/lib/affiliates/validation';
import { parseAffiliateCsv, previewAffiliateCsv } from '@/lib/affiliates/csv';
import { makeIntent, verifyIntent } from '@/lib/affiliates/intents';
import { offerJson, offerError, readOfferBody } from '@/lib/offers/security';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
  try {
    const owner=await requireAdministrator(request,true);const body=await readOfferBody(request,262144);
    if(Object.keys(body).some(key=>!['csv','action','preview_token'].includes(key))||typeof body.csv!=='string'||!['preview','commit'].includes(String(body.action)))throw new AppError('CSV_INVALID');
    const values=parseAffiliateCsv(body.csv);
    const existing=await affiliateQuery<AffiliateLink>('SELECT marketplace,product_id,channel,label FROM offers.affiliate_links WHERE account_id=$1 AND product_id=ANY($2::text[])',[affiliateAccount(),values.map(row=>row.product_id)]);
    const keys=new Set(existing.map(link=>affiliateKey({marketplace:link.marketplace,productId:link.product_id,channel:link.channel,label:link.label})));
    const preview=previewAffiliateCsv(body.csv,keys);const context=`csv:${owner}:${digest(body.csv)}`;
    if(body.action==='preview')return offerJson({rows:preview.rows,canImport:preview.canImport,preview_token:makeIntent(context)});
    if(!verifyIntent(body.preview_token,context)||!preview.canImport)throw new AppError('CSV_INVALID');
    await importAffiliateLinks(preview.inputs);return offerJson({imported:preview.inputs.length,status:'pending'},201);
  } catch(error){return offerError(error);}
}
