import 'server-only';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {accountConfig} from './configuration';
import {workerOnline} from './policy';
import {encrypt,decrypt,type EncryptedValue} from '../crypto';
import {getStorageEnv} from '../env';
import {AppError} from '../errors';
import {transaction} from '../database';
import {claimDelivery,previewWhatsApp} from './delivery';
import {MockDistributionProvider} from './providers';
export function workerId(value:unknown):string{if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{1,64}$/.test(value))throw new AppError('REQUEST_INVALID');return value;}
export function validateInventory(value:unknown){
 if(!Array.isArray(value)||value.length>100)throw new AppError('REQUEST_INVALID');
 return value.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['external_id','kind','name','can_send'].includes(k))||typeof row.name!=='string'||!row.name.trim()||row.name.length>120||/[\p{Cc}\p{Cf}]/u.test(row.name)||typeof row.can_send!=='boolean'||!['group','channel'].includes(row.kind)||typeof row.external_id!=='string'||!(row.kind==='group'?/^\d{5,30}(?:-\d{5,20})?@g\.us$/:/^\d{5,40}@newsletter$/).test(row.external_id))throw new AppError('REQUEST_INVALID');return {externalId:row.external_id as string,kind:row.kind as string,name:row.name as string,canSend:row.can_send as boolean};});
}
export async function workerHeartbeat(body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['action','worker_id','epoch','status','account_mask','destinations','qr_png'].includes(k)))throw new AppError('REQUEST_INVALID');
 const id=workerId(body.worker_id),a=await accountConfig();if(!a)return {configured:false,command:'none',dryRun:true};
 if(a.worker_id&&a.worker_id!==id&&workerOnline(a.last_seen_at))throw new AppError('QUEUE_CONFLICT');
 if(body.epoch!==a.connection_epoch)return {configured:true,command:a.command,epoch:a.connection_epoch,provider:a.provider,enabled:a.enabled,dryRun:true};
 if(!['disconnected','connecting','qr','connected','failed'].includes(String(body.status))||typeof body.account_mask!=='string'||!/^$|^••••\d{4}$/.test(body.account_mask))throw new AppError('REQUEST_INVALID');
 const status=body.status as string;let qr:EncryptedValue|null=null;
 if(body.qr_png!==undefined){if(status!=='qr'||typeof body.qr_png!=='string'||body.qr_png.length>64000||!/^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(body.qr_png))throw new AppError('REQUEST_INVALID');const key=getStorageEnv()?.key;if(!key)throw new AppError('STORAGE_ERROR');qr=encrypt(body.qr_png,key,`whatsapp:qr:${affiliateAccount()}:${a.connection_epoch}`);}
 const destinations=body.destinations===undefined?[]:validateInventory(body.destinations);
 await transaction(async db=>{
  const updated=await db.query(`UPDATE offers.whatsapp_accounts SET worker_id=$2,last_seen_at=NOW(),status=CASE WHEN enabled AND command IN('none','connect') THEN $4 ELSE 'disconnected' END,account_mask=$5,qr_encrypted=$6::jsonb,qr_expires_at=CASE WHEN $6::jsonb IS NOT NULL THEN NOW()+INTERVAL '45 seconds' ELSE NULL END,command=CASE WHEN command='connect' AND $4='connected' THEN 'none' ELSE command END,paused=CASE WHEN $4<>'connected' THEN TRUE ELSE paused END,updated_at=NOW() WHERE account_id=$1 AND connection_epoch=$3 RETURNING account_id`,[affiliateAccount(),id,a.connection_epoch,status,body.account_mask,qr?JSON.stringify(qr):null]);if(updated.rowCount!==1)throw new AppError('QUEUE_CONFLICT');
  await db.query('UPDATE offers.whatsapp_destinations SET can_send=FALSE WHERE account_id=$1',[affiliateAccount()]);
  if(status==='connected'&&a.enabled&&['none','connect'].includes(a.command))for(const d of destinations)await db.query(`INSERT INTO offers.whatsapp_destinations(account_id,connection_epoch,external_id,kind,name,can_send) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,connection_epoch,external_id) DO UPDATE SET name=EXCLUDED.name,can_send=EXCLUDED.can_send,last_seen_at=NOW()`,[affiliateAccount(),a.connection_epoch,d.externalId,d.kind,d.name,d.canSend]);
 });
 return {configured:true,command:a.command,epoch:a.connection_epoch,provider:a.provider,enabled:a.enabled,dryRun:true};
}
export async function adminQr(){
 const [row]=await affiliateQuery<{qr_encrypted:EncryptedValue;connection_epoch:string}>(`SELECT qr_encrypted,connection_epoch FROM offers.whatsapp_accounts WHERE account_id=$1 AND enabled AND status='qr' AND command='connect' AND qr_expires_at>NOW() AND last_seen_at>NOW()-INTERVAL '90 seconds'`,[affiliateAccount()]);if(!row?.qr_encrypted)throw new AppError('PROVIDER_NOT_CONFIGURED');const key=getStorageEnv()?.key;if(!key)throw new AppError('STORAGE_ERROR');return Buffer.from(decrypt(row.qr_encrypted,key,`whatsapp:qr:${affiliateAccount()}:${row.connection_epoch}`),'base64');
}
export async function processWorkerDryRun(worker:string){
 const claim=await claimDelivery(worker);if(!claim)return {dryRun:true,externalSent:false,processed:false};
 try{
  const moved=await affiliateQuery("UPDATE offers.distribution_queue SET state='validating',updated_at=NOW() WHERE account_id=$1 AND id=$2 AND claimed_by=$3 AND claim_token=$4 AND state='claimed' AND lease_expires_at>NOW() RETURNING id",[affiliateAccount(),claim.id,worker,claim.claim_token]);if(!moved.length)throw new AppError('QUEUE_CONFLICT');
  // The worker has no access to OAuth credentials, database credentials or scoring decisions.
  const [session]=await affiliateQuery<{owner_hash:string}>(`SELECT owner_hash FROM public.meli_connections WHERE user_id=$1 AND session_expires_at>NOW() ORDER BY updated_at DESC LIMIT 1`,[affiliateAccount()]);if(!session)throw new AppError('CONNECTION_MISSING');
  const result=await previewWhatsApp(session.owner_hash,claim.offer_id,claim.template_id,Number(claim.price_snapshot)/100);
  if(result.reasons.length||!result.payload)throw new AppError('OFFER_NOT_READY');
  await new MockDistributionProvider().send(result.payload,{id:result.destinationId??'',externalId:'mock-only',kind:'mock'},claim.id);
  const updated=await affiliateQuery(`UPDATE offers.distribution_queue SET state='ready',simulation_at=NOW(),message=$5,message_snapshot=$6::jsonb,claimed_by=NULL,claim_token=NULL,lease_expires_at=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND claimed_by=$3 AND claim_token=$4 AND state='validating' AND lease_expires_at>NOW() RETURNING id`,[affiliateAccount(),claim.id,worker,claim.claim_token,result.payload.text,JSON.stringify(result.payload)]);if(!updated.length)throw new AppError('QUEUE_CONFLICT');
  return {dryRun:true,externalSent:false,processed:true};
 }catch(error){
  const code=error instanceof AppError?error.code:'NETWORK_ERROR';
  await affiliateQuery(`UPDATE offers.distribution_queue SET state='failed',requires_review=TRUE,last_error_code=$5,lease_expires_at=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND claimed_by=$3 AND claim_token=$4 AND state IN('claimed','validating')`,[affiliateAccount(),claim.id,worker,claim.claim_token,code]);
  await affiliateQuery('UPDATE offers.whatsapp_accounts SET paused=TRUE,updated_at=NOW() WHERE account_id=$1',[affiliateAccount()]);console.warn('QUEUE_REVALIDATION_FAILED',{code});throw error;
 }
}
