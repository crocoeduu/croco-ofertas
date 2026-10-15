import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,readFile,writeFile,rename,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {recordHealth} from './health.mjs';
import {EncryptedStore,clearEncryptedSessions} from './encrypted-store.mjs';
import {transparentAuthClass} from './transparent-auth.mjs';
import {signedRequest,validTask,imageBytes} from './protocol.mjs';
// This service is deliberately outside Next.js. It never receives DB or Mercado Livre credentials.
const endpoint=new URL('/api/internal/whatsapp/worker',process.env.CROCO_ORIGIN??'https://croco-ofertas.vercel.app');
if(endpoint.origin!=='https://croco-ofertas.vercel.app')throw Error('CROCO_ORIGIN_INVALID');
const workerId=process.env.WHATSAPP_WORKER_ID;if(!/^[a-zA-Z0-9_-]{1,64}$/.test(workerId??''))throw Error('WORKER_ID_INVALID');
const secret=process.env.WHATSAPP_WORKER_SECRET; signedRequest({},secret);
const persistent=resolve(process.env.WHATSAPP_STATE_DIRECTORY??'/var/lib/croco');
const runtime=resolve(process.env.WHATSAPP_RUNTIME_DIRECTORY??'/run/croco');
// Deploy runtime on tmpfs: plaintext Chromium state exists only in RAM; persistent archives use AES-GCM.
await mkdir(runtime,{recursive:true,mode:0o700});await mkdir(persistent,{recursive:true,mode:0o700});process.chdir(runtime);
let client,status='disconnected',epoch='',qrPng,accountMask='',destinations=[],stopping=false,failures=0;
const mediaCache=new Map();
async function cachedImage(url){for(const [k,v] of mediaCache)if(v.expires<Date.now())mediaCache.delete(k);const cached=mediaCache.get(url);if(cached)return cached.image;const image=await imageBytes(url);if(mediaCache.size>=8)mediaCache.delete(mediaCache.keys().next().value);mediaCache.set(url,{image,expires:Date.now()+600000});return image;}
const journal=resolve(persistent,'delivery-journal.json');let completed={};try{completed=JSON.parse(await readFile(journal,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('DELIVERY_JOURNAL_INVALID',{cause:e});}
async function remember(id,receipt){completed[id]=receipt;await writeFile(journal+'.tmp',JSON.stringify(completed),{mode:0o600});await rename(journal+'.tmp',journal);}
async function api(body){const {raw,headers}=signedRequest({...body,worker_id:workerId},secret);const r=await fetch(endpoint,{method:'POST',headers,body:raw,redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('CROCO_REQUEST_FAILED');return r.json();}
async function destroy(remove=false){if(client){if(remove)await client.logout().catch(()=>{});await client.destroy().catch(()=>{});client=undefined;}if(remove)await clearEncryptedSessions(persistent);status='disconnected';destinations=[];qrPng=undefined;accountMask='';}
async function connect(resumeOnly=false){
 if(client||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true')return;
 if(runtime===persistent||process.platform!=='linux'||Number((await statfs(runtime)).type)!==0x01021994)throw Error('RUNTIME_TMPFS_REQUIRED');
 // Optional dependency is loaded only after explicit server AND worker enablement.
 // Sequential loading avoids Node's CJS/ESM require/import race in the optional driver.
 const {default:wweb}=await import('whatsapp-web.js');
 const {default:QR}=await import('qrcode');
 const {default:puppeteer}=await import('puppeteer');
 const TransparentAuth=transparentAuthClass(wweb.RemoteAuth,puppeteer);
 const store=new EncryptedStore(persistent,process.env.WHATSAPP_SESSION_ENCRYPTION_KEY,epoch);
 if(resumeOnly&&!await store.sessionExists({session:'RemoteAuth-croco'}))return;
 client=new wweb.Client({userAgent:false,bypassCSP:false,authStrategy:new TransparentAuth({clientId:'croco',dataPath:runtime,store,backupSyncIntervalMs:60000}),puppeteer:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'},webVersionCache:{type:'none'}});
 client.on('qr',async qr=>{if(resumeOnly){status='failed';qrPng=undefined;await destroy();status='failed';return;}status='qr';qrPng=(await QR.toBuffer(qr,{width:256,errorCorrectionLevel:'M'})).toString('base64');});
 client.on('ready',async()=>{status='connected';qrPng=undefined;accountMask='••••'+String(client.info?.wid?.user??'').slice(-4);console.info('WHATSAPP_CONNECTED');});
 client.on('auth_failure',()=>{status='failed';qrPng=undefined;console.warn('WHATSAPP_DISCONNECTED');});
 client.on('disconnected',()=>{status='disconnected';qrPng=undefined;console.warn('WHATSAPP_DISCONNECTED');});
 status='connecting';void client.initialize().catch(()=>{status='failed';console.warn('WHATSAPP_DISCONNECTED');});
}
async function inventory(){if(!client||status!=='connected')return;const self=client.info?.wid?._serialized;const chats=await client.getChats();destinations=chats.filter(c=>c.isGroup).slice(0,100).map(c=>({external_id:c.id._serialized,kind:'group',name:String(c.name).replace(/[\p{Cc}\p{Cf}]/gu,' ').slice(0,120)||'Grupo',can_send:!!c.groupMetadata?.participants?.some(p=>p.id?._serialized===self&&p.isAdmin)}));}
async function dispatch(task){
 if(!validTask(task)||process.env.WHATSAPP_SEND_ENABLED!=='true'||!client||status!=='connected')return;
 if(Object.hasOwn(completed,task.id)){const saved=completed[task.id];if(saved?.id)await api({action:'result',id:task.id,kind:task.kind,success:true,provider_message_id:saved.id});return;}
 // Persist BEFORE external handoff. An uncertain result is never retried automatically.
 await remember(task.id,{uncertain:true});let media;
 if(task.payload?.imageUrl){try{const image=await cachedImage(task.payload.imageUrl);const {default:wweb}=await import('whatsapp-web.js');media=new wweb.MessageMedia(image.mime,image.data.toString('base64'));}catch{if(task.payload.mediaFailureBehavior==='require_review'){await api({action:'result',id:task.id,kind:task.kind,success:false});return;}}}
 if(!validTask(task))return;
 const permission=await api({action:'handoff',id:task.id,kind:task.kind});
 if(!permission.allowed||!validTask(task)){await api({action:'result',id:task.id,kind:task.kind,success:false});return;}
 try{const receipt=await Promise.race([client.sendMessage(task.destination,media??task.message,media?{caption:task.message}:{}),delay(30000).then(()=>{throw Error('DELIVERY_AMBIGUOUS');})]);const id=receipt?.id?._serialized;if(!id)throw Error('DELIVERY_AMBIGUOUS');await remember(task.id,{id});await api({action:'result',id:task.id,kind:task.kind,success:true,provider_message_id:id});console.info('WHATSAPP_SEND_OK');}
 catch{console.warn('WHATSAPP_SEND_FAILED');await api({action:'result',id:task.id,kind:task.kind,success:false}).catch(()=>{});}
}
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){try{
 if(status==='connected')await inventory();
 const control=await api({action:'heartbeat',epoch,status,account_mask:accountMask,destinations,...(qrPng?{qr_png:qrPng}:{})});
 if(control.epoch&&control.epoch!==epoch){await destroy(control.command==='delete_session');epoch=control.epoch;}
 if(control.command==='disconnect'||control.command==='delete_session'||!control.enabled){await destroy(control.command==='delete_session');}
 else if(control.provider==='web_session'&&control.command==='connect')await connect();
 else if(control.provider==='web_session'&&control.command==='none'&&status==='disconnected')await connect(true);
 if(control.enabled&&(status==='connected'||control.provider==='mock')){const r=await api({action:'poll'});if(r.task)await dispatch(r.task);}
 await recordHealth(persistent,status);failures=0;
 }catch{failures++;console.warn('WORKER_REQUEST_FAILED');if(failures>=3){await destroy();stopping=true;}}
 if(!stopping)await delay(Math.min(60000,20000*2**failures));
}
await destroy();await recordHealth(persistent,'stopped');
