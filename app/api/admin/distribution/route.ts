import type { NextRequest } from 'next/server';
import { requireAdministrator } from '@/lib/affiliates/admin';
import { listChannels, listPreparedOffers, prepareOffer, saveChannel, disablePreparedOffer } from '@/lib/distribution/service';
import { AppError } from '@/lib/errors';
import { offerJson, offerError, readOfferBody } from '@/lib/offers/security';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try {await requireAdministrator(request);const [channels,offers]=await Promise.all([listChannels(),listPreparedOffers()]);return offerJson({channels,offers});}
  catch(error){return offerError(error);}
}
export async function POST(request:NextRequest) {
  try {const owner=await requireAdministrator(request,true);const body=await readOfferBody(request);const {action,...input}=body;
    if(action==='channel'){await saveChannel(input);return offerJson({saved:true});}
    if(action==='prepare')return offerJson(await prepareOffer(owner,input));
    if(action==='disable'){await disablePreparedOffer(input);return offerJson({state:'disabled'});}
    throw new AppError('REQUEST_INVALID');
  }catch(error){return offerError(error);}
}
