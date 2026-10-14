import type { NextRequest } from 'next/server';
import { requireAdministrator } from '@/lib/affiliates/admin';
import { disableAffiliateLink, saveAffiliateLink } from '@/lib/affiliates/repository';
import { validateAffiliate } from '@/lib/affiliates/validation';
import { offerJson, offerError, readOfferBody } from '@/lib/offers/security';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,context:Context) {
  try {await requireAdministrator(request,true);const body=await readOfferBody(request,8192);const {id}=await context.params;
    return offerJson({link:await saveAffiliateLink(validateAffiliate(body),id,typeof body.updated_at==='string'?body.updated_at:undefined)});
  } catch(error){return offerError(error);}
}
export async function DELETE(request:NextRequest,context:Context) {
  try {await requireAdministrator(request,true);await disableAffiliateLink((await context.params).id);return offerJson({status:'disabled'});}
  catch(error){return offerError(error);}
}
