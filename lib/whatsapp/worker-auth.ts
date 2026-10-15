import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {PostgresRateLimit} from '../rate-limit';
import {AppError} from '../errors';
import {affiliateQuery} from '../affiliates/repository';
export function validWorkerSignature(body:string,timestamp:string,nonce:string,signature:string,secret:string,now=Date.now()):boolean {
 if(!/^[a-f0-9]{64}$/i.test(secret)||!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>60000||!/^[a-f0-9-]{36}$/i.test(nonce)||!/^v1=[a-f0-9]{64}$/.test(signature))return false;
 const expected=createHmac('sha256',Buffer.from(secret,'hex')).update(`POST\n/api/internal/whatsapp/worker\n${timestamp}\n${nonce}\n${body}`).digest();return timingSafeEqual(expected,Buffer.from(signature.slice(3),'hex'));
}
export async function authenticateWorker(request:NextRequest,body:Record<string,unknown>){
 if(request.nextUrl.search||request.headers.get('origin'))throw new AppError('REQUEST_FORBIDDEN');
 const raw=JSON.stringify(body),time=request.headers.get('x-croco-timestamp')??'',nonce=request.headers.get('x-croco-nonce')??'',signature=request.headers.get('x-croco-signature')??'';
 if(!validWorkerSignature(raw,time,nonce,signature,process.env.WHATSAPP_WORKER_SECRET??''))throw new AppError('REQUEST_FORBIDDEN');
 // One signed bridge has a shared distributed budget across workers and serverless instances.
 if(!await new PostgresRateLimit().consume('croco:whatsapp:bridge',60,60))throw new AppError('RATE_LIMITED');
 // Persist replay protection across serverless instances. No credential is stored here.
 const rows=await affiliateQuery('INSERT INTO offers.worker_nonces(nonce,expires_at) VALUES($1,NOW()+INTERVAL \'2 minutes\') ON CONFLICT DO NOTHING RETURNING nonce',[nonce]);if(!rows.length)throw new AppError('REQUEST_FORBIDDEN');
 await affiliateQuery('DELETE FROM offers.worker_nonces WHERE nonce IN(SELECT nonce FROM offers.worker_nonces WHERE expires_at<NOW() LIMIT 100)');
}
