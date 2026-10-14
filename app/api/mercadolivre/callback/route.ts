import { NextRequest, NextResponse } from 'next/server';
import { getOAuthEnv, getStorageEnv } from '@/lib/env';
import { exchangeCode, generateState, validState } from '@/lib/mercadolivre/oauth';
import { saveMercadoLivreTokens } from '@/lib/mercadolivre/tokens';
import { digest } from '@/lib/crypto';
import { cookieNames, cookieOptions, clearOAuthCookies } from '@/lib/cookies';
import { errorResponse, privateHeaders } from '@/lib/http';
import { consumeOAuthState, enforceRateLimit } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    const params = request.nextUrl.searchParams;
    if (request.url.length > 8192 || [...params.keys()].some(key => !['code', 'state', 'error', 'error_description'].includes(key)) || ['code','state','error','error_description'].some(key => params.getAll(key).length > 1)) throw new AppError('INVALID_INPUT');
    const state = params.get('state');
    // No env or network access is needed to reject a callback with no state.
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw new AppError('INVALID_STATE');
    const env = getOAuthEnv(); const names = cookieNames(env.secure);
    if (!validState(request.cookies.get(names.state)?.value, state)) throw new AppError('INVALID_STATE');
    const verifier = request.cookies.get(names.pkce)?.value;
    if (!verifier || !/^[A-Za-z0-9_-]{64}$/.test(verifier)) throw new AppError('PKCE_MISSING');
    const rate = await enforceRateLimit(request, 'callback', env.secure, env.clientSecret);
    const error = params.get('error'); const description = params.get('error_description');
    if ((error && (!/^[a-z_]{1,100}$/.test(error) || params.has('code'))) || (description && (description.length > 2048 || !error))) throw new AppError('INVALID_INPUT');
    if (error) throw new AppError(error === 'access_denied' ? 'ACCESS_DENIED' : 'TOKEN_ENDPOINT_ERROR');
    const code = params.get('code');
    if (!code) throw new AppError('CODE_MISSING');
    if (!/^[A-Za-z0-9._~-]{1,2048}$/.test(code)) throw new AppError('INVALID_INPUT');
    const storage = getStorageEnv();
    await consumeOAuthState(state); // Atomic replay rejection when Postgres is configured.
    const tokens = await exchangeCode(env, code, verifier);
    const target = new URL('/', env.redirectUri); // Origin comes only from validated config.
    if (storage) {
      const session = generateState();
      await saveMercadoLivreTokens(digest(session), tokens);
      response = privateHeaders(NextResponse.redirect(target, 303));
      response.cookies.set(names.session, session, cookieOptions(env.secure, 30 * 24 * 60 * 60));
    } else {
      target.searchParams.set('connection', 'authorized-not-stored');
      response = privateHeaders(NextResponse.redirect(target, 303));
      // No token storage of any kind; secrets are discarded with this invocation.
    }
    rate(response);
  } catch (error) { response = errorResponse(error); }
  clearOAuthCookies(response);
  return response;
}
