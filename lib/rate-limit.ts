import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from './database';
import { AppError } from './errors';
import { storageError } from './storage-error';
import { digest } from './crypto';
import { cookieNames, cookieOptions } from './cookies';
export interface RateLimitBackend { consume(key: string, limit: number, windowSeconds: number): Promise<boolean> }
export class PostgresRateLimit implements RateLimitBackend {
  async consume(key: string, limit: number, windowSeconds: number) {
    const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
    try {
      const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
      const result = await db.query<{ hits: number }>(`INSERT INTO rate_limit_buckets (key,bucket,hits,expires_at) VALUES ($1,$2,1,NOW()+make_interval(secs=>$3))
        ON CONFLICT(key,bucket) DO UPDATE SET hits=rate_limit_buckets.hits+1 RETURNING hits`, [key, bucket, windowSeconds * 2]);
      return result.rows[0].hits <= limit;
    } catch (error) { throw storageError(error); }
  }
}
function sign(value: string, secret: string) { return createHmac('sha256', secret).update(`rate:${value}`).digest('base64url'); }
export async function enforceRateLimit(request: NextRequest, action: 'login' | 'callback', secure: boolean, secret: string): Promise<(response: NextResponse) => void> {
  if (getDatabase()) {
    // Vercel overwrites this header. Locally it is not a trustworthy client identity.
    const ip = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown' : 'local';
    if (!await new PostgresRateLimit().consume(digest(`${action}:${ip}`), action === 'login' ? 10 : 30, 60)) throw new AppError('RATE_LIMITED');
    return () => undefined;
  }
  // Signed browser cooldown only: deleting cookies bypasses it. Not a distributed limit.
  const names = cookieNames(secure);
  const value = request.cookies.get(names.rate)?.value;
  const [stamp, signature] = value?.split('.') ?? [];
  const expected = stamp ? sign(stamp, secret) : '';
  const verified = signature && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (action === 'login' && verified && Number(stamp) > Date.now() - 5000 && Number(stamp) <= Date.now()) throw new AppError('RATE_LIMITED');
  const now = String(Date.now());
  return response => response.cookies.set(names.rate, `${now}.${sign(now, secret)}`, cookieOptions(secure, 60));
}
export async function consumeOAuthState(state: string) {
  const db = getDatabase(); if (!db) return;
  try {
    const result = await db.query('INSERT INTO used_oauth_states (state_hash,expires_at) VALUES ($1,NOW()+INTERVAL \'15 minutes\') ON CONFLICT DO NOTHING RETURNING state_hash', [digest(state)]);
    if (result.rowCount !== 1) throw new AppError('INVALID_STATE');
  } catch (error) { throw storageError(error); }
}
