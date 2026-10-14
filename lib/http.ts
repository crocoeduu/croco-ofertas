import 'server-only';
import { NextResponse } from 'next/server';
import { safeError } from './errors';
export function privateHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return response;
}
export function errorResponse(error: unknown) {
  const safe = safeError(error);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexão · Croco Ofertas</title><style>body{font:16px/1.6 system-ui;background:#f5f7f2;color:#173127;margin:0;display:grid;min-height:100vh;place-items:center}main{margin:24px;max-width:480px;padding:40px;background:white;border-radius:24px;border:1px solid #dce5d8}h1{font-size:26px}a{color:#246145;font-weight:700}p{color:#5d6b63}</style></head><body><main><strong>CROCO OFERTAS</strong><h1>Não foi possível concluir a conexão</h1><p>${safe.message}</p><a href="/">Voltar à Central de Ofertas</a></main></body></html>`;
  const response = privateHeaders(new NextResponse(html, { status: safe.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  if (safe.code === 'RATE_LIMITED') response.headers.set('Retry-After', '60');
  return response;
}
