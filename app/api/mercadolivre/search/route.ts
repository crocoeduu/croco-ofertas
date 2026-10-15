import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { searchMercadoLivre, searchAccessDiagnostic } from '@/lib/mercadolivre/search';
import { offerJson, offerError, readOfferBody, requireOfferSession } from '@/lib/offers/security';
import { listPriceHistories, recordProducts } from '@/lib/offers/repository';
import { scoreOffer } from '@/lib/offers/scoring';
import { eligibleCoupons, listCoupons } from '@/lib/offers/coupons';
import { searchQuery } from '@/lib/offers/validation';
import { AffiliateLinkService } from '@/lib/affiliates/service';
import {listWatchlist} from '@/lib/operations/watchlist';
import {listPreparedOffers} from '@/lib/distribution/service';
import {updateWatchFromSearch} from '@/lib/operations/jobs';
import { isAdministrator } from '@/lib/affiliates/admin';
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
    // Optional sections fail independently. An unavailable affiliate lookup always fails closed.
    const enrichment=await Promise.allSettled([listPriceHistories(owner,result.products.map(product=>product.id)),listCoupons(owner),new AffiliateLinkService().forProducts(result.products,'site'),isAdministrator(owner)]);
    const histories=enrichment[0].status==='fulfilled'?enrichment[0].value:new Map();
    const coupons=enrichment[1].status==='fulfilled'?enrichment[1].value:[];
    const affiliates=enrichment[2].status==='fulfilled'?enrichment[2].value:new Map();
    const administrator=enrichment[3].status==='fulfilled'&&enrichment[3].value;
    let watchIds:string[]=[],readyIds:string[]=[];
    if(administrator){const optional=await Promise.allSettled([listWatchlist(),listPreparedOffers(),updateWatchFromSearch(owner,result.products.map(p=>p.id))]);if(optional[0].status==='fulfilled')watchIds=optional[0].value.filter(w=>w.active).map(w=>w.product_id);if(optional[1].status==='fulfilled')readyIds=optional[1].value.filter(o=>o.state==='ready_to_send').map(o=>o.product_id);}
    const now = new Date();
    return offerJson({ ...result,products:result.products.map(product => ({...product,scoring:scoreOffer(product,histories.get(product.id) ?? [],now),coupons:eligibleCoupons(coupons,product,now),affiliate:affiliates.get(product.id)??{status:'affiliate_pending'}})),observedAt:now.toISOString(),affiliateLinksEnabled:true,administrator,watchIds,readyIds,partialData:enrichment.some(r=>r.status==='rejected') });
  } catch (error) { return offerError(error,searchAccessDiagnostic(error)); }
}
