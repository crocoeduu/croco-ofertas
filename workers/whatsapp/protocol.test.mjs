import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {signedRequest,validTask,allowedMedia,imageBytes} from './protocol.mjs';
import {EncryptedStore} from './encrypted-store.mjs';
const now=Date.now(),id='12345678-1234-4123-8123-123456789012';
test('assinatura determinística; segredo nunca vai no corpo',()=>{const r=signedRequest({action:'poll'},'a'.repeat(64),now,id);assert.match(r.headers['x-croco-signature'],/^v1=[a-f0-9]{64}$/);assert.equal(r.raw,'{"action":"poll"}');});
test('expiração e destino restringem tarefa; oferta precisa link e anúncio',()=>{const task={kind:'test',id,key:id,destination:'123456789@g.us',message:'Teste',expiresAt:new Date(now+10000).toISOString()};assert.equal(validTask(task,now),true);assert.equal(validTask({...task,expiresAt:new Date(now-1).toISOString()},now),false);assert.equal(validTask({...task,destination:'https://evil.test'},now),false);assert.equal(validTask({...task,kind:'offer'},now),false);});
test('mídia bloqueia SSRF, redirect e arquivos grandes',async()=>{assert.equal(allowedMedia('https://127.0.0.1/a.jpg'),false);assert.equal(allowedMedia('https://http2.mlstatic.com/a.jpg'),true);let called=0;await assert.rejects(imageBytes('https://evil.test/a.jpg',()=>{called++;}));assert.equal(called,0);await assert.rejects(imageBytes('https://http2.mlstatic.com/a.jpg',async()=>({ok:true,headers:new Headers({'content-type':'image/jpeg','content-length':'99999999'})})));});
test('arquivo da sessão usa AES-GCM, contexto e chave; conteúdo não persiste em claro',async()=>{const dir=await mkdtemp(join(tmpdir(),'croco-wa-'));const cwd=process.cwd();process.chdir(dir);try{const store=new EncryptedStore(join(dir,'encrypted'),'b'.repeat(64),'epoch1');await writeFile('fixture.zip','mock-session-content');await store.save({session:'fixture'});const raw=await readFile(store.path('fixture'));assert.equal(raw.includes(Buffer.from('mock-session-content')),false);await store.extract({session:'fixture',path:join(dir,'restored.zip')});assert.equal(await readFile('restored.zip','utf8'),'mock-session-content');const wrong=new EncryptedStore(join(dir,'encrypted'),'c'.repeat(64),'epoch1');await assert.rejects(wrong.extract({session:'fixture',path:join(dir,'wrong.zip')}));await store.delete({session:'fixture'});assert.equal(await store.sessionExists({session:'fixture'}),false);}finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}});

test("driver opcional instancia com Puppeteer corrigido sem conexão externa",async()=>{const {default:w}=await import("whatsapp-web.js");const c=new w.Client({puppeteer:{headless:true,executablePath:"/usr/bin/chromium"}});assert.ok(c);});

test('Chromium mantém identificação de automação e CSP sem mascaramento',async()=>{const {transparentAuthClass}=await import('./transparent-auth.mjs');const calls=[];class Auth{async beforeBrowserInitialized(){this.client.options.puppeteer.userDataDir='/run/croco/mock';}}const T=transparentAuthClass(Auth,{launch:async opts=>{calls.push(opts);return {wsEndpoint:()=> 'ws://127.0.0.1/mock-local-only'};}});const auth=new T();auth.client={options:{puppeteer:{headless:true}}};await auth.beforeBrowserInitialized();assert.deepEqual(calls[0].args,[]);assert.equal(auth.client.options.userAgent,false);assert.equal(auth.client.options.bypassCSP,false);assert.equal(auth.client.options.puppeteer.browserWSEndpoint,'ws://127.0.0.1/mock-local-only');await assert.rejects(auth.beforeBrowserInitialized(),/RECONNECT_REQUIRES_ADMIN/);});

test('healthcheck distingue heartbeat recente de falha, restart e arquivo ausente',async()=>{
 const {recordHealth,healthy}=await import('./health.mjs');const dir=await mkdtemp(join(tmpdir(),'croco-health-'));
 try{assert.equal(await healthy(dir,now),false);await recordHealth(dir,'connected',now);assert.equal(await healthy(dir,now+1000),true);assert.equal(await healthy(dir,now+90001),false);await recordHealth(dir,'stopped',now);assert.equal(await healthy(dir,now),false);}finally{await rm(dir,{recursive:true,force:true});}
});

test('apagar sessão remove arquivos cifrados mesmo sem cliente conectado e preserva recibos',async()=>{
 const {clearEncryptedSessions}=await import('./encrypted-store.mjs');const dir=await mkdtemp(join(tmpdir(),'croco-delete-'));
 try{const file=join(dir,'a'.repeat(64)+'.enc');await writeFile(file,'cipher-fixture');await writeFile(join(dir,'delivery-journal.json'),'{}');await clearEncryptedSessions(dir);await assert.rejects(readFile(file));assert.equal(await readFile(join(dir,'delivery-journal.json'),'utf8'),'{}');}finally{await rm(dir,{recursive:true,force:true});}
});
