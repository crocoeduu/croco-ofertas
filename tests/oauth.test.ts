import { describe, it, expect, vi } from 'vitest';
import { authorizationUrl, codeChallenge, exchangeCode, generatePKCE, generateState, postToken, refreshMercadoLivreToken, validState, validateTokenResponse } from '@/lib/mercadolivre/oauth';
import { getOAuthEnv, getStorageEnv } from '@/lib/env';
import { AppError, safeError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { randomBytes } from 'node:crypto';
const source = { NODE_ENV: 'production', MELI_CLIENT_ID: '123456', MELI_CLIENT_SECRET: 'unit-secret-placeholder', MELI_REDIRECT_URI: 'https://example.com/api/mercadolivre/callback' };
const env = getOAuthEnv(source);
import { tokenFixture } from './fixtures';
describe('OAuth e PKCE', () => {
  it('gera state com 256 bits e valores diferentes', () => { const states = Array.from({length: 100}, generateState); expect(new Set(states).size).toBe(100); expect(states.every(s => /^[\w-]{43}$/.test(s))).toBe(true); });
  it('gera verifier com 384 bits e S256', () => { const pkce = generatePKCE(); expect(pkce.verifier).toMatch(/^[\w-]{64}$/); expect(pkce.challenge).toBe(codeChallenge(pkce.verifier)); });
  it('implementa o vetor oficial RFC 7636', () => expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));
  it('aceita somente state válido', () => { const state = generateState(); expect(validState(state,state)).toBe(true); expect(validState(state,generateState())).toBe(false); expect(validState(undefined,state)).toBe(false); expect(validState(state,null)).toBe(false); expect(validState(state,'a')).toBe(false); });
  it('preserva Redirect URI exata e host fixo na autorização', () => { const url = authorizationUrl(env,generateState(),generatePKCE().challenge); expect(url.origin).toBe('https://auth.mercadolivre.com.br'); expect(url.searchParams.get('redirect_uri')).toBe(source.MELI_REDIRECT_URI); expect(url.searchParams.get('code_challenge_method')).toBe('S256'); expect(url.href).not.toContain(env.clientSecret); });
  it('env ausente é sanitizado', () => expect(() => getOAuthEnv({})).toThrow('ENV_MISSING'));
  it.each(['http://example.com/api/mercadolivre/callback','https://example.com/api/mercadolivre/callback/','https://example.com/api/mercadolivre/callback?abc=1','https://example.com/api/mercadolivre/callback#x','https://user:pass@example.com/api/mercadolivre/callback'])('rejeita URI inválida %s', uri => expect(() => getOAuthEnv({...source,MELI_REDIRECT_URI:uri})).toThrow('ENV_INVALID'));
  it('permite localhost HTTP apenas em desenvolvimento', () => { expect(getOAuthEnv({...source,NODE_ENV:'development',MELI_REDIRECT_URI:'http://localhost:3000/api/mercadolivre/callback'}).secure).toBe(false); expect(() => getOAuthEnv({...source,VERCEL:'1',NODE_ENV:'development',MELI_REDIRECT_URI:'http://localhost:3000/api/mercadolivre/callback'})).toThrow(); });
  it('banco ausente não usa armazenamento alternativo', () => expect(getStorageEnv({})).toBeNull());
  it('exige chave e TLS verificado quando banco está ativo', () => { expect(() => getStorageEnv({DATABASE_URL:'postgres://localhost/db'})).toThrow('ENV_MISSING'); expect(() => getStorageEnv({NODE_ENV:'production',DATABASE_URL:'postgres://localhost/db',TOKEN_ENCRYPTION_KEY:'1'.repeat(64)})).toThrow('ENV_INVALID'); });
  it('troca code uma vez com URLSearchParams e redirect exato', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(tokenFixture)); const pkce = generatePKCE();
    await exchangeCode(env,'unit-code',pkce.verifier,fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.mercadolibre.com/oauth/token'); expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
    const body = init?.body as URLSearchParams;
    expect(body.get('redirect_uri')).toBe(env.redirectUri); expect(body.get('code_verifier')).toBe(pkce.verifier); expect(body.get('client_secret')).toBe(env.clientSecret);
  });
  it('refresh recebe token rotacionado sem retry', async () => { const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({...tokenFixture,refresh_token:'mock-rotated-token'})); const tokens=await refreshMercadoLivreToken(env,'mock-old-token',fetcher); expect(tokens.refresh_token).toBe('mock-rotated-token'); expect((fetcher.mock.calls[0][1]?.body as URLSearchParams).get('grant_type')).toBe('refresh_token'); expect(fetcher).toHaveBeenCalledTimes(1); });
  it.each([{}, {...tokenFixture,expires_in:-1},{...tokenFixture,user_id:'123'},{...tokenFixture,access_token:''},{...tokenFixture,token_type:'basic'},{...tokenFixture,refresh_token:undefined}])('rejeita resposta inválida em runtime', data => expect(() => validateTokenResponse(data)).toThrow('TOKEN_ENDPOINT_ERROR'));
  it('rejeita Content-Type inesperado e JSON inválido', async () => {
    for(const response of [new Response('secret',{headers:{'Content-Type':'text/plain'}}),new Response('{broken',{headers:{'Content-Type':'application/json'}})]) await expect(postToken(new URLSearchParams(),vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow('TOKEN_ENDPOINT_ERROR');
  });
  it('HTTP 429 tem classificação própria', async () => await expect(postToken(new URLSearchParams(),vi.fn<typeof fetch>().mockResolvedValue(new Response('secret',{status:429})))).rejects.toThrow('RATE_LIMITED'));
  it('não propaga payload remoto ou mensagem de rede', async () => { const fetcher=vi.fn<typeof fetch>().mockRejectedValue(new Error('secret in network message')); await expect(postToken(new URLSearchParams(),fetcher)).rejects.toThrow('NETWORK_ERROR'); expect(fetcher).toHaveBeenCalledTimes(1); expect(safeError(new Error('secret')).message).not.toContain('secret'); expect(safeError(new AppError('INVALID_STATE')).status).toBe(400); });
  it('aborta em 10 segundos sem retry', async () => {
    vi.useFakeTimers();
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async (_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')))));
    const promise=postToken(new URLSearchParams(),fetcher); const assertion=expect(promise).rejects.toThrow('NETWORK_ERROR'); await vi.advanceTimersByTimeAsync(10000); await assertion; expect(fetcher).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
});
describe('AES-256-GCM',()=>{
  it('usa nonce novo e autentica o contexto',()=>{ const key=randomBytes(32); const first=encrypt('mock-token',key,'owner:refresh'); const second=encrypt('mock-token',key,'owner:refresh'); expect(first.iv).not.toBe(second.iv); expect(decrypt(first,key,'owner:refresh')).toBe('mock-token'); expect(()=>decrypt(first,key,'other-owner:refresh')).toThrow('STORAGE_ERROR'); expect(()=>decrypt({...first,authTag:randomBytes(16).toString('base64')},key,'owner:refresh')).toThrow('STORAGE_ERROR'); expect(JSON.stringify(first)).not.toContain('mock-token'); });
});
