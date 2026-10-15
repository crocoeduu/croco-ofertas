import type {NextRequest} from 'next/server';
import {timingSafeEqual,createHash} from 'node:crypto';
import {affiliateAccount,affiliateQuery} from '@/lib/affiliates/repository';
import {runCollection} from '@/lib/operations/jobs';
import {offerJson,offerError} from '@/lib/offers/security';
import {AppError} from '@/lib/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:NextRequest){try{
 const secret=process.env.CRON_SECRET;const header=request.headers.get('authorization')??'';
 if(!secret||secret.length<32||request.nextUrl.search||!timingSafeEqual(createHash('sha256').update(header).digest(),createHash('sha256').update(`Bearer ${secret}`).digest()))throw new AppError('REQUEST_FORBIDDEN');
 const [row]=await affiliateQuery<{owner_hash:string}>('SELECT owner_hash FROM public.meli_connections WHERE user_id=$1 AND session_expires_at>NOW() ORDER BY updated_at DESC LIMIT 1',[affiliateAccount()]);
 if(!row)throw new AppError('CONNECTION_MISSING');return offerJson(await runCollection(row.owner_hash));
}catch(error){return offerError(error);}}
