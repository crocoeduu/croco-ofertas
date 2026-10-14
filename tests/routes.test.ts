import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as login } from '@/app/api/mercadolivre/login/route';
import { GET as callback } from '@/app/api/mercadolivre/callback/route';
import { GET as health } from '@/app/api/health/route';
import { generatePKCE, generateState } from '@/lib/mercadolivre/oauth';
import { tokenFixture } from './fixtures';
vi.mock('@/lib/database',()=>({getDatabase:vi.fn(()=>null),transaction:vi.fn()}));
const state=generateState(); const pkce=generatePKCE();
function request(query: string, cookie=true, verifier=true) {
  const headers: Record<string,string>={};
  if(cookie) headers.cookie=`__Host-meli_state=${state}${verifier?`; __Host-meli_pkce=${pkce.verifier}`:''}`;
  return new NextRequest(`https://example.com/api/mercadolivre/callback${query}`,{headers});
}
beforeEach(()=>{vi.stubEnv('NODE_ENV','production');vi.stubEnv('MELI_CLIENT_ID','123456');vi.stubEnv('MELI_CLIENT_SECRET','unit-secret-placeholder');vi.stubEnv('MELI_REDIRECT_URI','https://example.com/api/mercadolivre/callback');vi.stubEnv('DATABASE_URL','');vi.stubEnv('TOKEN_ENCRYPTION_KEY','');vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json(tokenFixture)));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('rotas',()=>{
  it('health é mínimo',async()=>expect(await health().json()).toEqual({status:'ok'}));
  it('login redireciona host fixo com cookies protegidos',async()=>{const response=await login(new NextRequest('https://host-forjado.example/api/mercadolivre/login'));expect(response.status).toBe(302); const location=new URL(response.headers.get('location')!);expect(location.hostname).toBe('auth.mercadolivre.com.br');expect(location.searchParams.get('redirect_uri')).toBe(process.env.MELI_REDIRECT_URI);const cookie=response.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=lax');expect(cookie).toContain('__Host-meli_pkce');expect(cookie).not.toContain('Domain=');expect(response.headers.get('Cache-Control')).toBe('no-store');});
  it('env ausente retorna 503 sem segredo',async()=>{vi.stubEnv('MELI_CLIENT_SECRET','');const response=await login(new NextRequest('https://example.com/api/mercadolivre/login'));expect(response.status).toBe(503);expect(await response.text()).not.toContain('MELI_CLIENT');expect(fetch).not.toHaveBeenCalled();});
  it.each([['',400],[`?code=unit-code`,400],[`?state=${generateState()}&code=unit-code`,400],[`?state=${state}`,400],[`?state=${state}&error=access_denied`,403],[`?state=${state}&code=unit-code&next=https://evil.example`,400],[`?state=${state}&state=${state}&code=unit-code`,400]])('rejeita callback %s',async(query,status)=>{const response=await callback(request(query));expect(response.status).toBe(status);expect(fetch).not.toHaveBeenCalled();expect(response.headers.get('set-cookie')).toContain('Max-Age=0');expect(response.headers.get('Cache-Control')).toBe('no-store');const html=await response.text();expect(html).not.toContain('unit-secret-placeholder');expect(html).not.toContain('stack');});
  it('rejeita cookie expirado/ausente',async()=>{expect((await callback(request(`?state=${state}&code=unit-code`,false))).status).toBe(400);expect(fetch).not.toHaveBeenCalled();});
  it('rejeita PKCE ausente',async()=>{expect((await callback(request(`?state=${state}&code=unit-code`,true,false))).status).toBe(400);expect(fetch).not.toHaveBeenCalled();});
  it('ignora error_description malicioso',async()=>{const response=await callback(request(`?state=${state}&error=access_denied&error_description=${encodeURIComponent('<script>secret</script>')}`));expect(response.status).toBe(403);const html=await response.text();expect(html).not.toContain('<script>');expect(html).not.toContain('secret');});
  it('sucesso sem banco descarta tokens e redireciona para rota fixa',async()=>{const response=await callback(request(`?state=${state}&code=unit-code`));expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('https://example.com/?connection=authorized-not-stored');expect(fetch).toHaveBeenCalledTimes(1);const output=await response.text()+JSON.stringify([...response.headers]);expect(output).not.toContain(tokenFixture.access_token);expect(output).not.toContain(tokenFixture.refresh_token);expect(output).not.toContain('unit-secret-placeholder');expect(response.cookies.get('__Host-croco_session')).toBeUndefined();});
  it('refresh de callback após limpeza é erro amigável sem fetch',async()=>{const response=await callback(request(`?state=${state}&code=unit-code`,false));expect(response.status).toBe(400);expect(fetch).not.toHaveBeenCalled();});
  it('login não aceita redirect arbitrário nem início cross-site',async()=>{expect((await login(new NextRequest('https://example.com/api/mercadolivre/login?redirect=https://evil.example'))).status).toBe(400);expect((await login(new NextRequest('https://example.com/api/mercadolivre/login',{headers:{'sec-fetch-site':'cross-site'}}))).status).toBe(400);});
  it('cooldown básico bloqueia segundo login',async()=>{const first=await login(new NextRequest('https://example.com/api/mercadolivre/login'));const rate=first.cookies.get('__Host-meli_rate')!;const second=await login(new NextRequest('https://example.com/api/mercadolivre/login',{headers:{cookie:`${rate.name}=${rate.value}`}}));expect(second.status).toBe(429);expect(second.headers.get('Retry-After')).toBe('60');});
});
