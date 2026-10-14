import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`, "img-src 'self' data: https://http2.mlstatic.com", "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`, "object-src 'none'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'", ...(dev ? [] : ['upgrade-insecure-requests'])
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
// /go has its own script-free CSP and a restricted official form redirect allowlist.
export const config = { matcher: ['/((?!api|go/|_next/static|_next/image|favicon.ico|.*\\..*).*)'] };
