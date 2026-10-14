import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const sentinels = Array.from({length:3},()=>randomBytes(32).toString('hex'));
const port = 3217;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)], { env: { ...process.env, NODE_ENV:'production', MELI_CLIENT_ID:'123456', MELI_CLIENT_SECRET:sentinels[0], MELI_ACCESS_TOKEN:sentinels[1], MELI_REFRESH_TOKEN:sentinels[2], MELI_REDIRECT_URI:'https://example.com/api/mercadolivre/callback',DATABASE_URL:'',TOKEN_ENCRYPTION_KEY:'' }, stdio:'ignore' });
const request = path => fetch(`http://127.0.0.1:${port}${path}`,{redirect:'manual',signal:globalThis.AbortSignal.timeout(5000)});
try {
  let ready=false;
  for(let attempt=0;attempt<40;attempt++) { try { if((await request('/api/health')).ok) { ready=true; break; } } catch { /* Server may still be starting. */ } await new Promise(resolve=>setTimeout(resolve,250)); }
  assert(ready,'Servidor de produção não iniciou.');
  const home=await request('/'); assert.equal(home.status,200); const html=await home.text();
  assert(html.includes('Central de')); assert(sentinels.every(secret=>!html.includes(secret)));
  const csp=home.headers.get('content-security-policy');assert(csp?.includes("'strict-dynamic'"));assert(!csp.includes("'unsafe-eval'"));assert(!csp.includes("'unsafe-inline'"));
  const nonce=csp.match(/'nonce-([^']+)'/)[1];assert(html.includes(`nonce="${nonce}"`));assert.equal(home.headers.get('x-frame-options'),'DENY');
  const health=await request('/api/health');assert.deepEqual(await health.json(),{status:'ok'});
  const radar=await request('/ofertas');assert.equal(radar.status,200);const radarHtml=await radar.text();assert(radarHtml.includes('Radar de'));assert(sentinels.every(secret=>!radarHtml.includes(secret)));
  const affiliates=await request('/afiliados');assert.equal(affiliates.status,200);const affiliatesHtml=await affiliates.text();assert(affiliatesHtml.includes('Acesso administrativo'));assert(sentinels.every(secret=>!affiliatesHtml.includes(secret)));assert(!affiliatesHtml.includes('Minha URL afiliada oficial'));
  for(const path of ['/api/admin/affiliates','/api/admin/distribution'])assert.equal((await request(path)).status,401);
  const forbiddenAffiliate=await fetch(`http://127.0.0.1:${port}/api/admin/affiliates`,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(forbiddenAffiliate.status,403);
  const openRedirect=await request('/go/mercadolivre/12345678-1234-4123-8123-123456789012?url=https://evil.example');assert.equal(openRedirect.status,400);assert.equal(openRedirect.headers.get('location'),null);
  assert.equal((await request('/go/mercadolivre/invalid-id')).status,404);
  const privateSearch=await fetch(`http://127.0.0.1:${port}/api/mercadolivre/search`,{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({query:'fone'}),signal:globalThis.AbortSignal.timeout(5000)});assert.equal(privateSearch.status,401);assert.equal(privateSearch.headers.get('cache-control'),'no-store');
  for(const path of ['/api/mercadolivre/products/MLB123456789/history','/api/offers/coupons'])assert.equal((await request(path)).status,401);
  const login=await request('/api/mercadolivre/login');assert.equal(login.status,302);const location=new URL(login.headers.get('location'));assert.equal(location.origin,'https://auth.mercadolivre.com.br');assert.equal(location.searchParams.get('redirect_uri'),'https://example.com/api/mercadolivre/callback');assert.equal(location.searchParams.get('code_challenge_method'),'S256');
  assert(login.headers.get('set-cookie').includes('HttpOnly'));assert(login.headers.get('set-cookie').includes('Secure'));
  for(const path of ['/api/mercadolivre/callback','/api/mercadolivre/callback?code=unit-code','/api/mercadolivre/callback?state=wrong&code=unit-code']) { const response=await request(path);assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');assert(sentinels.every(secret=>!response.headers.get('set-cookie')?.includes(secret)));const errorHtml=await response.text();assert(sentinels.every(secret=>!errorHtml.includes(secret)));assert(!errorHtml.includes('stack')); }
  for(const path of ['/.env','/.env.local','/api/env','/api/debug','/api/config','/admin']) assert.equal((await request(path)).status,404);
  const files=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(async entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]))).flat();
  for(const file of await files('.next/static')) {if(!file.endsWith('.js'))continue;const text=await readFile(file,'utf8');assert(sentinels.every(secret=>!text.includes(secret)));assert(!text.includes('MELI_CLIENT_SECRET'));assert(!text.includes('TOKEN_ENCRYPTION_KEY'));}
  console.log('Smoke de produção aprovado: página, health, login, callback inválida, nonce CSP, cookies, endpoints ausentes e ausência de segredos no HTML/JS.');
} catch { console.error('Smoke de produção falhou. Revise as rotas e headers; nenhum segredo foi registrado.');process.exitCode=1; }
finally { server.kill(); }
