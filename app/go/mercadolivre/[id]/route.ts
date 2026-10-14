import { NextRequest, NextResponse } from 'next/server';
import { getAffiliateLink, recordAffiliateClick } from '@/lib/affiliates/repository';
import { affiliateId, affiliateChannel } from '@/lib/affiliates/validation';
import { makeIntent, verifyIntent } from '@/lib/affiliates/intents';
import { getOAuthEnv } from '@/lib/env';
import { PostgresRateLimit } from '@/lib/rate-limit';
import { digest } from '@/lib/crypto';
import { AppError } from '@/lib/errors';
import { privateHeaders, errorResponse } from '@/lib/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
const cookie=(secure:boolean)=>secure?'__Host-croco_affiliate_intent':'croco_affiliate_intent';
function outboundHeaders(response:NextResponse){
  privateHeaders(response);
  // Chrome checks form-action across a POST redirect. Permit only the official destinations.
  response.headers.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://mercadolivre.com https://www.mercadolivre.com https://mercadolivre.com.br https://www.mercadolivre.com.br https://produto.mercadolivre.com.br");
  response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  return response;
}
function queryChannel(request:NextRequest){const params=request.nextUrl.searchParams;if([...params.keys()].some(key=>key!=='channel')||params.getAll('channel').length>1)throw new AppError('REQUEST_INVALID');return params.has('channel')?affiliateChannel(params.get('channel')):undefined;}
export async function GET(request:NextRequest,context:Context) {
  try {
    const channel=queryChannel(request);
    const id=affiliateId((await context.params).id);const link=await getAffiliateLink(id,true);if(!link)throw new AppError('AFFILIATE_NOT_FOUND');
    if(channel&&link.channel!=='generic'&&channel!==link.channel)throw new AppError('REQUEST_INVALID');
    const token=makeIntent(`click:${id}${channel?`:${channel}`:''}`);const env=getOAuthEnv();
    // An explicit second click avoids automatically redirecting visitors, which the program forbids.
    const response=privateHeaders(new NextResponse(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ver oferta · Croco Ofertas</title><style>body{font:16px/1.6 system-ui;background:#f5f7f2;color:#173127;display:grid;min-height:95vh;place-items:center}main{max-width:480px;padding:32px;background:white;border-radius:20px}button{background:#246145;color:white;padding:14px;border:0;border-radius:10px;font:inherit;cursor:pointer}a{color:#246145}</style></head><body><main><strong>CROCO OFERTAS · PUBLICIDADE</strong><h1>Continuar ao Mercado Livre</h1><p>Este é um link afiliado cadastrado pelo administrador. Podemos receber comissão em compras elegíveis, sem custo adicional para você. Preço, estoque, frete e condições devem ser confirmados no Mercado Livre.</p><form method="post" action="/go/mercadolivre/${id}${channel?`?channel=${channel}`:''}"><input type="hidden" name="intent" value="${token}"><button type="submit">Ver oferta no Mercado Livre</button></form><p>Ao continuar, registramos apenas produto, canal, campanha e horário do clique. Não guardamos seu IP neste registro.</p><a href="/ofertas">Voltar ao Radar</a></main></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
    response.cookies.set(cookie(env.secure),token,{httpOnly:true,secure:env.secure,sameSite:'strict',path:'/',maxAge:300});return outboundHeaders(response);
  } catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest,context:Context) {
  try {
    const env=getOAuthEnv();const id=affiliateId((await context.params).id);const channel=queryChannel(request);
    if(request.headers.get('origin')!==new URL(env.redirectUri).origin||request.headers.get('sec-fetch-site')==='cross-site'||!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type')??''))throw new AppError('REQUEST_FORBIDDEN');
    if(Number(request.headers.get('content-length')??0)>512)throw new AppError('REQUEST_INVALID');
    const reader=request.body?.getReader();if(!reader)throw new AppError('REQUEST_INVALID');let text='';let bytes=0;
    try {for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>512){await reader.cancel();throw new AppError('REQUEST_INVALID');}text+=Buffer.from(chunk.value).toString('utf8');}}finally{reader.releaseLock();}
    const form=new URLSearchParams(text);const token=form.get('intent');
    if([...form.keys()].length!==1||request.cookies.get(cookie(env.secure))?.value!==token||!verifyIntent(token,`click:${id}${channel?`:${channel}`:''}`))throw new AppError('REQUEST_FORBIDDEN');
    const ip=process.env.VERCEL==='1'?request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()??'unknown':'local';
    const limiter=new PostgresRateLimit();
    if(!await limiter.consume(digest(`affiliate:intent:${token}`),1,300)||!await limiter.consume(digest(`affiliate:ip:${ip}`),30,60))throw new AppError('RATE_LIMITED');
    const destination=await recordAffiliateClick(id,channel);const response=privateHeaders(NextResponse.redirect(destination,302));
    response.cookies.set(cookie(env.secure),'',{httpOnly:true,secure:env.secure,sameSite:'strict',path:'/',maxAge:0});return outboundHeaders(response);
  } catch(error){return errorResponse(error);}
}
