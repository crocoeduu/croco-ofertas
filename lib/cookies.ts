import 'server-only';
import type { NextResponse } from 'next/server';
export function cookieNames(secure: boolean) {
  const prefix = secure ? '__Host-' : '';
  return { state: `${prefix}meli_state`, pkce: `${prefix}meli_pkce`, session: `${prefix}croco_session`, rate: `${prefix}meli_rate` };
}
export function cookieOptions(secure: boolean, maxAge = 600) { return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge }; }
export function clearOAuthCookies(response: NextResponse) {
  for (const secure of [true, false]) {
    const names = cookieNames(secure);
    for (const name of [names.state, names.pkce]) response.cookies.set(name, '', cookieOptions(secure, 0));
  }
}
