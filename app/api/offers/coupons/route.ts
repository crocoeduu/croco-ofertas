import { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { listCoupons, saveCoupon, validateCoupon } from '@/lib/offers/coupons';
import { offerError, offerJson, readOfferBody, requireOfferSession } from '@/lib/offers/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try { const owner = await requireOfferSession(request); if (request.nextUrl.search) throw new AppError('REQUEST_INVALID'); return offerJson({coupons:await listCoupons(owner)}); }
  catch (error) { return offerError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const owner = await requireOfferSession(request,true);
    if (request.nextUrl.search) throw new AppError('REQUEST_INVALID');
    return offerJson({coupon:await saveCoupon(owner,validateCoupon(await readOfferBody(request)))},201);
  } catch (error) { return offerError(error); }
}
