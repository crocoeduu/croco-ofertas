import 'server-only';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {affiliateId,officialAffiliateUrl} from '../affiliates/validation';
import {transaction} from '../database';
import {AppError} from '../errors';
import {claimDelivery,previewWhatsApp} from './delivery';
import {accountConfig} from './configuration';
import {deliveryPolicy,realSendEnabled,workerOnline,retryAt} from './policy';
import {withinWindow} from '../operations/policy';
import {digest} from '../crypto';
import type {WhatsAppPayload} from './composer';
export const firstTestMessage='🧪 Teste Croco Ofertas\n\nIntegração configurada corretamente.\n\nNenhuma oferta foi publicada.';
export async function authorizeFirstTest(phrase:unknown){
 if(phrase!=='pode enviar o primeiro teste'||process.env.WHATSAPP_SEND_ENABLED!=='true'||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true')throw new AppError('AUTOMATION_PAUSED');
 await transaction(async db=>{
  const a=(await db.query<{selected_destination:string;connection_epoch:string}>(`SELECT a.* FROM offers.whatsapp_accounts a JOIN offers.whatsapp_destinations d ON d.id=a.selected_destination AND d.account_id=a.account_id AND d.connection_epoch=a.connection_epoch WHERE a.account_id=$1 AND a.enabled AND a.provider='web_session' AND a.unofficial_confirmed AND a.status='connected' AND a.last_seen_at>NOW()-INTERVAL '90 seconds' AND d.public_confirmed AND d.can_send AND d.last_seen_at>NOW()-INTERVAL '90 seconds' FOR UPDATE OF a,d`,[affiliateAccount()])).rows[0];if(!a)throw new AppError('PROVIDER_NOT_CONFIGURED');
  const previous=await db.query("SELECT id FROM offers.whatsapp_test_permits WHERE account_id=$1 AND destination_id=$2 AND connection_epoch=$3 AND state IN('pending','sending','sent','ambiguous')",[affiliateAccount(),a.selected_destination,a.connection_epoch]);if(previous.rowCount)throw new AppError('QUEUE_CONFLICT');
  await db.query("INSERT INTO offers.whatsapp_test_permits(account_id,destination_id,connection_epoch,authorized_by) VALUES($1,$2,$3,$1)",[affiliateAccount(),a.selected_destination,a.connection_epoch]);
 });
}
export async function enableAuto(){
 if(!realSendEnabled()||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true')throw new AppError('AUTOMATION_PAUSED');
 const rows=await affiliateQuery(`UPDATE offers.whatsapp_accounts a SET paused=FALSE,updated_at=NOW() FROM offers.whatsapp_destinations d WHERE a.account_id=$1 AND d.account_id=a.account_id AND d.id=a.selected_destination AND d.connection_epoch=a.connection_epoch AND d.verified_by_admin AND d.public_confirmed AND d.can_send AND a.enabled AND a.status='connected' AND a.provider='web_session' AND a.last_seen_at>NOW()-INTERVAL '90 seconds' RETURNING a.account_id`,[affiliateAccount()]);if(!rows.length)throw new AppError('PROVIDER_NOT_CONFIGURED');
}
export interface WorkerTask {kind:'test'|'offer';id:string;destination:string;message:string;payload?:WhatsAppPayload;expiresAt:string;key:string}
export async function nextRealTask(worker:string):Promise<WorkerTask|null>{
 const a=await accountConfig();if(process.env.WHATSAPP_SEND_ENABLED!=='true'||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true'||!a?.enabled||a.provider!=='web_session'||!a.unofficial_confirmed||a.status!=='connected'||a.worker_id!==worker||!workerOnline(a.last_seen_at))return null;
 const test=await transaction(async db=>{
  // This separate permit is one explicit authorization, one destination, one fixed test message.
  const r=await db.query<{id:string;external_id:string}>(`WITH p AS(SELECT p.id,d.external_id FROM offers.whatsapp_test_permits p JOIN offers.whatsapp_accounts a ON a.account_id=p.account_id AND a.connection_epoch=p.connection_epoch JOIN offers.whatsapp_destinations d ON d.id=p.destination_id AND d.account_id=p.account_id WHERE p.account_id=$1 AND p.state='pending' AND p.expires_at>NOW() AND a.selected_destination=d.id AND a.enabled AND d.public_confirmed AND d.can_send FOR UPDATE OF p,a,d SKIP LOCKED LIMIT 1) UPDATE offers.whatsapp_test_permits t SET state='sending',claimed_by=$2 FROM p WHERE t.id=p.id RETURNING t.id,p.external_id`,[affiliateAccount(),worker]);return r.rows[0];
 });
 if(test)return {kind:'test',id:test.id,destination:test.external_id,message:firstTestMessage,key:test.id,expiresAt:new Date(Date.now()+15000).toISOString()};
 if(!realSendEnabled()||a.paused||!withinWindow(deliveryPolicy(a.policy)))return null;
 const claim=await claimDelivery(worker);if(!claim)return null;
 try{
  const [session]=await affiliateQuery<{owner_hash:string}>(`SELECT owner_hash FROM public.meli_connections WHERE user_id=$1 AND session_expires_at>NOW() ORDER BY updated_at DESC LIMIT 1`,[affiliateAccount()]);if(!session)throw new AppError('CONNECTION_MISSING');
  const r=await previewWhatsApp(session.owner_hash,claim.offer_id,claim.template_id,Number(claim.price_snapshot)/100);if(r.reasons.length||!r.payload||r.affiliate.status!=='affiliate_ready')throw new AppError('OFFER_NOT_READY');
  const payload=r.payload,link=r.affiliate;
  return await transaction(async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${affiliateAccount()}:wa:dispatch`]);
   const config=(await db.query<{policy:Record<string,unknown>;external_id:string}>(`SELECT a.policy,d.external_id FROM offers.whatsapp_accounts a JOIN offers.whatsapp_destinations d ON d.id=a.selected_destination AND d.account_id=a.account_id AND d.connection_epoch=a.connection_epoch JOIN offers.affiliate_channels c ON c.account_id=a.account_id AND c.channel='whatsapp' WHERE a.account_id=$1 AND c.enabled AND c.public_channel AND c.declared_in_program AND a.enabled AND NOT a.paused AND a.provider='web_session' AND a.unofficial_confirmed AND a.status='connected' AND a.last_seen_at>NOW()-INTERVAL '90 seconds' AND d.verified_by_admin AND d.public_confirmed AND d.can_send AND d.id=$2 AND d.last_seen_at>NOW()-INTERVAL '90 seconds' FOR SHARE OF a,d,c`,[affiliateAccount(),r.destinationId])).rows[0];
   if(!config||!realSendEnabled())throw new AppError('AUTOMATION_PAUSED');const p=deliveryPolicy(config.policy);if(JSON.stringify(p)!==JSON.stringify(r.policy))throw new AppError('OFFER_NOT_READY');if(!withinWindow(p))throw new AppError('DISTRIBUTION_WINDOW');
   const quota=(await db.query<{hour:string;day:string;last:Date|null;inflight:string}>(`SELECT COUNT(*) FILTER(WHERE sent_at>NOW()-INTERVAL '1 hour')::text AS hour,COUNT(*) FILTER(WHERE sent_at>=date_trunc('day',NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')::text AS day,MAX(sent_at) AS last,(SELECT COUNT(*)::text FROM offers.distribution_queue WHERE account_id=$1 AND destination_id=$2 AND state='sending') AS inflight FROM offers.delivery_snapshots WHERE account_id=$1 AND destination_id=$2`,[affiliateAccount(),r.destinationId])).rows[0];
   if(Number(quota.inflight)>0||Number(quota.hour)>=p.maximumPerHour||Number(quota.day)>=p.maximumPerDay||(quota.last&&Date.now()-quota.last.getTime()<p.minimumIntervalMinutes*60000))throw new AppError('DISTRIBUTION_LIMIT');
   const linkCheck=await db.query("SELECT id FROM offers.affiliate_links WHERE account_id=$1 AND id=$2 AND affiliate_url=$3 AND status='verified' AND own_link_confirmed FOR SHARE",[affiliateAccount(),link.id,officialAffiliateUrl(link.affiliateUrl)]);if(linkCheck.rowCount!==1)throw new AppError('AFFILIATE_NOT_FOUND');
   const source=await db.query("SELECT id FROM offers.distribution_offers WHERE account_id=$1 AND id=$2 AND approved AND state NOT IN('disabled','expired','candidate','sent') FOR SHARE",[affiliateAccount(),claim.offer_id]);if(source.rowCount!==1)throw new AppError('OFFER_NOT_READY');
   const moved=await db.query(`UPDATE offers.distribution_queue SET state='sending',message=$5,message_snapshot=$6::jsonb,payload_digest=$7,affiliate_link_id=$8,lease_expires_at=NOW()+INTERVAL '1 minute',updated_at=NOW() WHERE account_id=$1 AND id=$2 AND claimed_by=$3 AND claim_token=$4 AND state='claimed' AND lease_expires_at>NOW() RETURNING id`,[affiliateAccount(),claim.id,worker,claim.claim_token,payload.text,JSON.stringify(payload),digest(JSON.stringify(payload)),link.id]);if(moved.rowCount!==1)throw new AppError('QUEUE_CONFLICT');
   return {kind:'offer',id:claim.id,destination:config.external_id,message:payload.text,payload,key:claim.id,expiresAt:new Date(Date.now()+15000).toISOString()};
  });
 }catch(error){const code=error instanceof AppError?error.code:'NETWORK_ERROR';const retry=['NETWORK_ERROR','MELI_API_ERROR'].includes(code)?retryAt(claim.attempts):null;await affiliateQuery("UPDATE offers.distribution_queue SET state=CASE WHEN $6::timestamptz IS NULL THEN 'failed' ELSE 'queued' END,requires_review=($6::timestamptz IS NULL),scheduled_at=COALESCE($6,scheduled_at),last_error_code=$5,lease_expires_at=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND claimed_by=$3 AND claim_token=$4 AND state='claimed'",[affiliateAccount(),claim.id,worker,claim.claim_token,code,retry]);await affiliateQuery('UPDATE offers.whatsapp_accounts SET paused=TRUE WHERE account_id=$1',[affiliateAccount()]);console.warn('QUEUE_REVALIDATION_FAILED',{code});throw error;}
}
export async function finishTask(worker:string,body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['action','worker_id','id','kind','provider_message_id','success'].includes(k))||!['test','offer'].includes(String(body.kind))||typeof body.success!=='boolean'||(body.success&&(typeof body.provider_message_id!=='string'||! /^[a-zA-Z0-9_:@.-]{1,250}$/.test(body.provider_message_id))))throw new AppError('REQUEST_INVALID');
 const id=affiliateId(body.id);
 await transaction(async db=>{
  if(body.kind==='test'){
   const r=await db.query<{destination_id:string}>(`UPDATE offers.whatsapp_test_permits SET state=$4,provider_message_id=$5 WHERE account_id=$1 AND id=$2 AND claimed_by=$3 AND state='sending' RETURNING destination_id`,[affiliateAccount(),id,worker,body.success?'sent':'ambiguous',body.success?body.provider_message_id:null]);
   if(r.rows[0]&&body.success)await db.query('UPDATE offers.whatsapp_destinations SET last_test_at=NOW() WHERE account_id=$1 AND id=$2',[affiliateAccount(),r.rows[0].destination_id]);
  }else{
   const r=(await db.query<{destination_id:string;product_id:string;catalog_product_id:string|null;category:string|null;message_snapshot:WhatsAppPayload}>(`UPDATE offers.distribution_queue SET state=$4,provider_message_id=$5,receipt_status=CASE WHEN $4='sent' THEN 'sent' ELSE 'failed' END,requires_review=($4='failed'),last_error_code=CASE WHEN $4='failed' THEN 'DELIVERY_AMBIGUOUS' ELSE NULL END,sent_at=CASE WHEN $4='sent' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND claimed_by=$3 AND state='sending' RETURNING *`,[affiliateAccount(),id,worker,body.success?'sent':'failed',body.success?body.provider_message_id:null])).rows[0];
   if(r&&body.success){const payload=r.message_snapshot;await db.query(`INSERT INTO offers.delivery_snapshots(account_id,queue_id,destination_id,product_id,catalog_product_id,category,price_cents,score,payload,provider_message_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,[affiliateAccount(),id,r.destination_id,r.product_id,r.catalog_product_id,r.category,Math.round(payload.price*100),payload.score,JSON.stringify(payload),body.provider_message_id]);}
  }
  // The first test always leaves automation paused. Any ambiguous delivery also pauses.
  if(body.kind==='test'||!body.success)await db.query('UPDATE offers.whatsapp_accounts SET paused=TRUE,updated_at=NOW() WHERE account_id=$1',[affiliateAccount()]);
 });
 console.info(body.success?'WHATSAPP_SEND_OK':'WHATSAPP_SEND_FAILED');return {saved:true};
}

// Recheck the kill switch after media download and immediately before transport handoff.
export async function authorizeHandoff(worker:string,body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['action','worker_id','id','kind'].includes(k))||!['test','offer'].includes(String(body.kind)))throw new AppError('REQUEST_INVALID');
 const id=affiliateId(body.id);
 if(process.env.WHATSAPP_SEND_ENABLED!=='true'||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true')return {allowed:false};
 if(body.kind==='offer'&&!realSendEnabled())return {allowed:false};
 const rows=body.kind==='test'?await affiliateQuery(`SELECT p.id FROM offers.whatsapp_test_permits p JOIN offers.whatsapp_accounts a ON a.account_id=p.account_id AND a.connection_epoch=p.connection_epoch JOIN offers.whatsapp_destinations d ON d.id=p.destination_id AND d.account_id=p.account_id AND d.connection_epoch=a.connection_epoch WHERE p.account_id=$1 AND p.id=$2 AND p.claimed_by=$3 AND p.state='sending' AND p.expires_at>NOW() AND a.worker_id=$3 AND a.selected_destination=d.id AND a.enabled AND a.unofficial_confirmed AND a.provider='web_session' AND a.status='connected' AND a.last_seen_at>NOW()-INTERVAL '90 seconds' AND d.public_confirmed AND d.can_send AND d.last_seen_at>NOW()-INTERVAL '90 seconds'`,[affiliateAccount(),id,worker]):await affiliateQuery(`SELECT q.id FROM offers.distribution_queue q JOIN offers.whatsapp_accounts a ON a.account_id=q.account_id JOIN offers.whatsapp_destinations d ON d.id=q.destination_id AND d.account_id=q.account_id AND d.connection_epoch=a.connection_epoch JOIN offers.affiliate_links l ON l.id=q.affiliate_link_id AND l.account_id=q.account_id JOIN offers.distribution_offers o ON o.id=q.offer_id AND o.account_id=q.account_id JOIN offers.affiliate_channels c ON c.account_id=q.account_id AND c.channel='whatsapp' WHERE q.account_id=$1 AND q.id=$2 AND q.claimed_by=$3 AND q.state='sending' AND q.lease_expires_at>NOW() AND a.worker_id=$3 AND NOT a.paused AND a.enabled AND a.unofficial_confirmed AND a.provider='web_session' AND a.status='connected' AND a.last_seen_at>NOW()-INTERVAL '90 seconds' AND a.selected_destination=d.id AND d.verified_by_admin AND d.public_confirmed AND d.can_send AND d.last_seen_at>NOW()-INTERVAL '90 seconds' AND l.status='verified' AND l.own_link_confirmed AND l.affiliate_url=q.message_snapshot->>'affiliateUrl' AND o.approved AND o.state NOT IN('disabled','expired','candidate','sent') AND c.enabled AND c.public_channel AND c.declared_in_program`,[affiliateAccount(),id,worker]);
 return {allowed:rows.length===1};
}
