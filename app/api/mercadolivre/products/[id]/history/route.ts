import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { offerError, offerJson, requireOfferSession } from '@/lib/offers/security';
import { listPriceHistories, productExists } from '@/lib/offers/repository';
import { productId } from '@/lib/offers/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireOfferSession(request);
    const days=Number(request.nextUrl.searchParams.get('days')??30);
    if(![7,30,90].includes(days)||[...request.nextUrl.searchParams.keys()].some(key=>key!=='days')||request.nextUrl.searchParams.getAll('days').length>1)throw new AppError('REQUEST_INVALID');
    const id = productId((await context.params).id);
    if (!await productExists(owner,id)) throw new AppError('PRODUCT_NOT_FOUND');
    const history = (await listPriceHistories(owner,[id],days as 7|30|90)).get(id) ?? [];
    return offerJson({ productId:id,history,windowDays:days,sampling:'one_observation_per_hour' });
  } catch (error) { return offerError(error); }
}
