import type { NextRequest } from 'next/server';
import { requireAdministrator } from '@/lib/affiliates/admin';
import { listAffiliateLinks, saveAffiliateLink, affiliateDashboard } from '@/lib/affiliates/repository';
import { validateRegisteredAffiliate } from '@/lib/affiliates/input';
import { offerJson, offerError, readOfferBody } from '@/lib/offers/security';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request: NextRequest) {
  try {await requireAdministrator(request);const [links,dashboard]=await Promise.all([listAffiliateLinks(),affiliateDashboard()]);return offerJson({links,dashboard});}
  catch(error){return offerError(error);}
}
export async function POST(request: NextRequest) {
  try {await requireAdministrator(request,true);return offerJson({link:await saveAffiliateLink(await validateRegisteredAffiliate(await readOfferBody(request,8192)))},201);}
  catch(error){return offerError(error);}
}
