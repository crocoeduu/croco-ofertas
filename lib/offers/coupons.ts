import 'server-only';
import { getDatabase } from '../database';
import { AppError } from '../errors';
import { storageError } from '../storage-error';
import { productId, priceCents } from './validation';
import type { Product } from './contracts';

export interface Coupon {
  id: string; code: string; kind: 'percent' | 'fixed'; amount: number; minimumPurchase: number;
  maximumDiscount: number | null; productId: string | null; startsAt: string; expiresAt: string;
  verified: boolean; source: 'manual';
}
export interface CouponInput { code: string; kind: Coupon['kind']; amount: number; minimumPurchase: number; maximumDiscount: number | null; productId: string | null; startsAt: Date; expiresAt: Date }
export function validateCoupon(body: Record<string, unknown>, now = new Date()): CouponInput {
  try {
    if (Object.keys(body).some(key => !['code','kind','amount','minimumPurchase','maximumDiscount','productId','startsAt','expiresAt'].includes(key))) throw new Error();
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !['percent','fixed'].includes(String(body.kind))) throw new Error();
    const kind = body.kind as Coupon['kind']; const amount = body.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || (kind === 'percent' && amount > 100)) throw new Error();
    if (Math.abs(amount*100-Math.round(amount*100)) > 0.00001) throw new Error();
    const minimumPurchase = body.minimumPurchase ?? 0;
    if (typeof minimumPurchase !== 'number' || minimumPurchase < 0 || !Number.isFinite(minimumPurchase) || minimumPurchase > 1_000_000_000) throw new Error();
    const maximumDiscount = body.maximumDiscount == null ? null : priceCents(body.maximumDiscount)/100;
    const id = body.productId == null || body.productId === '' ? null : productId(body.productId);
    const startsAt = body.startsAt == null ? now : new Date(String(body.startsAt));
    const expiresAt = new Date(String(body.expiresAt));
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt || expiresAt <= now || expiresAt.getTime()-now.getTime() > 366*86400_000) throw new Error();
    return { code,kind,amount:kind === 'fixed' ? priceCents(amount)/100 : amount,minimumPurchase:Math.round(minimumPurchase*100)/100,maximumDiscount,productId:id,startsAt,expiresAt };
  } catch { throw new AppError('COUPON_INVALID'); }
}

interface CouponRow { id: string; code: string; kind: Coupon['kind']; amount_units: string; minimum_purchase_cents: string; maximum_discount_cents: string | null; product_id: string | null; starts_at: Date; expires_at: Date; verified: boolean }
function unpack(row: CouponRow): Coupon {
  return { id:row.id,code:row.code,kind:row.kind,amount:Number(row.amount_units)/100,minimumPurchase:Number(row.minimum_purchase_cents)/100,
    maximumDiscount:row.maximum_discount_cents == null ? null : Number(row.maximum_discount_cents)/100,productId:row.product_id,
    startsAt:row.starts_at.toISOString(),expiresAt:row.expires_at.toISOString(),verified:row.verified,source:'manual' };
}
export async function saveCoupon(owner: string, input: CouponInput): Promise<Coupon> {
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try {
    const result = await db.query<CouponRow>(`INSERT INTO offers.coupons (owner_hash,code,kind,amount_units,minimum_purchase_cents,maximum_discount_cents,product_id,starts_at,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [owner,input.code,input.kind,Math.round(input.amount*100),Math.round(input.minimumPurchase*100),input.maximumDiscount == null ? null : priceCents(input.maximumDiscount),input.productId,input.startsAt,input.expiresAt]);
    return unpack(result.rows[0]); // verified is a DB default; the visitor cannot assert verification.
  } catch (error) { throw storageError(error); }
}
export async function listCoupons(owner: string): Promise<Coupon[]> {
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try { const result = await db.query<CouponRow>('SELECT * FROM offers.coupons WHERE owner_hash=$1 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 100', [owner]); return result.rows.map(unpack); }
  catch (error) { throw storageError(error); }
}
export function eligibleCoupons(coupons: Coupon[], product: Product, now = new Date()): Coupon[] {
  return coupons.filter(coupon => (!coupon.productId || coupon.productId === product.id) && coupon.minimumPurchase <= product.price && new Date(coupon.startsAt) <= now && new Date(coupon.expiresAt) > now);
}
// Future imports must retain provider restrictions and verifiable source evidence.
// Manual coupons never alter product prices or inflate the offer score.
