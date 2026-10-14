import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { digest } from '../crypto';
import { getOAuthEnv } from '../env';
import { AppError, safeError } from '../errors';
import { cookieNames } from '../cookies';
import { hasConnection } from '../mercadolivre/tokens';
import { PostgresRateLimit } from '../rate-limit';
import { privateHeaders } from '../http';

export async function requireOfferSession(request: NextRequest, mutation = false): Promise<string> {
  if (mutation) {
    const origin = new URL(getOAuthEnv().redirectUri).origin;
    if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('REQUEST_FORBIDDEN');
  } else if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('REQUEST_FORBIDDEN');
  const session = request.cookies.get(cookieNames(getOAuthEnv().secure).session)?.value;
  if (!session || !/^[A-Za-z0-9_-]{43}$/.test(session)) throw new AppError('CONNECTION_MISSING');
  const owner = digest(session);
  if (!await hasConnection(owner)) throw new AppError('CONNECTION_MISSING');
  const ip = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown' : 'local';
  const limiter = new PostgresRateLimit();
  if (!await limiter.consume(digest(`offers:session:${owner}`), 20, 60) || !await limiter.consume(digest(`offers:ip:${ip}`), 60, 60)) throw new AppError('SEARCH_RATE_LIMITED');
  return owner;
}

export async function readOfferBody(request: NextRequest): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '') || !request.body) throw new AppError('REQUEST_INVALID');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new AppError('REQUEST_INVALID'); }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('REQUEST_INVALID');
    return data as Record<string, unknown>;
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError('REQUEST_INVALID'); }
  finally { reader.releaseLock(); }
}

export function offerJson(data: unknown, status = 200) { return privateHeaders(NextResponse.json(data, { status })); }
export function offerError(error: unknown, diagnostic?: {resource:'marketplace'|'catalog_search'|'catalog_product';reason:'POLICY_DENIED'|'FORBIDDEN'}) {
  const safe = safeError(error); const response = offerJson({ error: { code: safe.code, message: safe.message, ...(diagnostic ? {diagnostic} : {}) } }, safe.status);
  if (safe.status === 429) response.headers.set('Retry-After', '60');
  return response;
}
