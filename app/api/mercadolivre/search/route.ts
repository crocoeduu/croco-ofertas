import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { searchMercadoLivre, searchAccessDiagnostic } from '@/lib/mercadolivre/search';
import { offerJson, offerError, readOfferBody, requireOfferSession } from '@/lib/offers/security';
import { listPriceHistories, recordProducts } from '@/lib/offers/repository';
import { scoreOffer } from '@/lib/offers/scoring';
import { eligibleCoupons, listCoupons } from '@/lib/offers/coupons';
import { searchQuery } from '@/lib/offers/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const owner = await requireOfferSession(request,true);
    const body = await readOfferBody(request);
    if (request.nextUrl.search || Object.keys(body).some(key => !['query','offset'].includes(key))) throw new AppError('REQUEST_INVALID');
    const query = searchQuery(body.query); const offset = body.offset ?? 0;
    if (typeof offset !== 'number') throw new AppError('SEARCH_INVALID');
    const result = await searchMercadoLivre(owner,query,offset);
    await recordProducts(owner,result.products);
    const [histories,coupons] = await Promise.all([listPriceHistories(owner,result.products.map(product => product.id)),listCoupons(owner)]);
    const now = new Date();
    return offerJson({ ...result,products:result.products.map(product => ({...product,scoring:scoreOffer(product,histories.get(product.id) ?? [],now),coupons:eligibleCoupons(coupons,product,now)})),observedAt:now.toISOString(),affiliateLinksEnabled:false });
  } catch (error) { return offerError(error,searchAccessDiagnostic(error)); }
}
