import {createHmac,randomUUID} from 'node:crypto';
export function signedRequest(body,secret,now=Date.now(),nonce=randomUUID()){if(!/^[a-f0-9]{64}$/i.test(secret??''))throw Error('WORKER_SECRET_INVALID');const raw=JSON.stringify(body),timestamp=String(now);return {raw,headers:{'Content-Type':'application/json','x-croco-timestamp':timestamp,'x-croco-nonce':nonce,'x-croco-signature':'v1='+createHmac('sha256',Buffer.from(secret,'hex')).update(`POST\n/api/internal/whatsapp/worker\n${timestamp}\n${nonce}\n${raw}`).digest('hex')}};}
export function validTask(task,now=Date.now()){
 if(!task||!['test','offer'].includes(task.kind)||typeof task.id!=='string'||! /^[a-f0-9-]{36}$/.test(task.id)||task.key!==task.id||typeof task.message!=='string'||!task.message||task.message.length>4096||typeof task.destination!=='string'||! /^(?:\d{5,30}(?:-\d{5,20})?@g\.us|\d{5,40}@newsletter)$/.test(task.destination))return false;
 const age=Date.parse(task.expiresAt)-now;if(!Number.isFinite(age)||age<=0||age>20000)return false;
 if(task.kind==='offer'){const p=task.payload;if(!p||p.text!==task.message||!p.advertising||!p.text.includes('(anúncio)')||! /^https:\/\/(?:meli\.la\/[A-Za-z0-9]{6,40}|(?:www\.)?mercadolivre\.com(?:\.br)?\/sec\/[A-Za-z0-9]{6,40})$/.test(p.affiliateUrl)||!p.text.includes(p.affiliateUrl)||!Number.isFinite(p.price)||p.price<=0)return false;}
 return true;
}
export function allowedMedia(url){try{const u=new URL(url);return u.protocol==='https:'&&['http2.mlstatic.com','mla-s1-p.mlstatic.com','mla-s2-p.mlstatic.com','mlb-s1-p.mlstatic.com','mlb-s2-p.mlstatic.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port&&/^\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(u.pathname);}catch{return false;}}
export async function imageBytes(url,fetcher=fetch){
 if(!allowedMedia(url))throw Error('MEDIA_INVALID');const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok||!/^image\/(?:jpeg|png|webp)$/.test(r.headers.get('content-type')??'')||Number(r.headers.get('content-length'))>5*1024*1024||!r.body)throw Error('MEDIA_INVALID');
 const reader=r.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024)throw Error('MEDIA_TOO_LARGE');chunks.push(value);}return {data:Buffer.concat(chunks),mime:r.headers.get('content-type')};}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
