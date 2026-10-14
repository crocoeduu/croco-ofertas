import { NextRequest, NextResponse } from 'next/server';
import { getOAuthEnv, getStorageEnv } from '@/lib/env';
import { authorizationUrl, generatePKCE, generateState } from '@/lib/mercadolivre/oauth';
import { cookieNames, cookieOptions, clearOAuthCookies } from '@/lib/cookies';
import { errorResponse, privateHeaders } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.search || request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('INVALID_INPUT');
    const env = getOAuthEnv();
    getStorageEnv(); // Fail closed if configured persistence cannot encrypt safely.
    const rate = await enforceRateLimit(request, 'login', env.secure, env.clientSecret);
    const state = generateState(); const pkce = generatePKCE(); const names = cookieNames(env.secure);
    const response = privateHeaders(NextResponse.redirect(authorizationUrl(env, state, pkce.challenge), 302));
    response.cookies.set(names.state, state, cookieOptions(env.secure));
    response.cookies.set(names.pkce, pkce.verifier, cookieOptions(env.secure));
    rate(response);
    return response;
  } catch (error) { const response = errorResponse(error); clearOAuthCookies(response); return response; }
}
