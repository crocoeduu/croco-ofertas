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
    if (request.nextUrl.search) throw new AppError('REQUEST_INVALID');
    const id = productId((await context.params).id);
    if (!await productExists(owner,id)) throw new AppError('PRODUCT_NOT_FOUND');
    const history = (await listPriceHistories(owner,[id])).get(id) ?? [];
    return offerJson({ productId:id,history,windowDays:30,sampling:'one_observation_per_hour' });
  } catch (error) { return offerError(error); }
}
