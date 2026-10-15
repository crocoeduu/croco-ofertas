import 'server-only';
import {transaction} from '../database';
import {AppError} from '../errors';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {affiliateId,officialAffiliateUrl} from '../affiliates/validation';
import {campaigns} from '../operations/campaigns';
import {getSettings,storedProducts} from '../operations/repository';
import {withinWindow} from '../operations/policy';
import {prepareOffer} from './service';
import {randomUUID} from 'node:crypto';
export interface QueueRow {id:string;offer_id:string;product_id:string;channel:string;campaign:string;state:string;message:string;price_snapshot:string;score_snapshot:number;scheduled_at:string;attempts:number;last_error_code:string|null;simulation_at:string|null;sent_at:string|null}
export async function queueRows(){return affiliateQuery<QueueRow>(`SELECT id,offer_id,product_id,channel,campaign,state,message,price_snapshot,score_snapshot,scheduled_at::text,attempts,last_error_code,simulation_at::text,sent_at::text FROM offers.distribution_queue WHERE account_id=$1 ORDER BY created_at DESC LIMIT 100`,[affiliateAccount()]);}
export async function enqueue(offerId:unknown){
 const id=affiliateId(offerId),account=affiliateAccount();const settings=await getSettings();if(!settings.distributionEnabled||settings.paused)throw new AppError('AUTOMATION_PAUSED');
 return transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${account}:queue`]);
  const row=(await db.query<{id:string;product_id:string;channel:string;campaign:string;affiliate_link_id:string;message:string;price_cents:string;score:number;revalidated_at:Date;updated_at:Date}>(`SELECT o.* FROM offers.distribution_offers o JOIN offers.affiliate_links l ON l.id=o.affiliate_link_id AND l.account_id=o.account_id JOIN offers.affiliate_channels c ON c.account_id=o.account_id AND c.channel=o.channel WHERE o.account_id=$1 AND o.id=$2 AND o.state IN('ready_to_send','queued') AND o.approved AND o.available AND o.message IS NOT NULL AND o.revalidated_at>NOW()-INTERVAL '5 minutes' AND l.status='verified' AND l.own_link_confirmed AND c.enabled AND c.public_channel AND c.declared_in_program FOR SHARE OF o,l,c`,[account,id])).rows[0];
  if(!row||row.score<settings.minimumScore)throw new AppError('OFFER_NOT_READY');
  const existing=(await db.query<{id:string}>(`SELECT id FROM offers.distribution_queue WHERE account_id=$1 AND marketplace='mercadolivre' AND product_id=$2 AND channel=$3 AND state IN('draft','queued','validating','ready','sending')`,[account,row.product_id,row.channel])).rows[0];if(existing)return existing;
  const key=`${id}:${row.updated_at.toISOString()}`;
  const result=await db.query<{id:string}>(`INSERT INTO offers.distribution_queue(account_id,offer_id,marketplace,product_id,channel,campaign,affiliate_link_id,message,price_snapshot,score_snapshot,idempotency_key) VALUES($1,$2,'mercadolivre',$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(account_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id`,[account,id,row.product_id,row.channel,row.campaign,row.affiliate_link_id,row.message,row.price_cents,row.score,key]);
  await db.query("UPDATE offers.distribution_offers SET state='queued',updated_at=NOW() WHERE account_id=$1 AND id=$2",[account,id]);return result.rows[0];
 });
}
export async function cancelQueue(id:unknown){const rows=await affiliateQuery(`UPDATE offers.distribution_queue SET state='cancelled',lease_until=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND state IN('draft','queued','ready','failed') RETURNING id`,[affiliateAccount(),affiliateId(id)]);if(!rows.length)throw new AppError('QUEUE_CONFLICT');}
export async function simulateQueue(owner:string,id:unknown){
 const account=affiliateAccount(),queueId=affiliateId(id);const settings=await getSettings();
 if(!settings.distributionEnabled||settings.paused)throw new AppError('AUTOMATION_PAUSED');
 if(!withinWindow(settings))throw new AppError('DISTRIBUTION_WINDOW');
 const [already]=await affiliateQuery<QueueRow>('SELECT * FROM offers.distribution_queue WHERE account_id=$1 AND id=$2',[account,queueId]);
 if(already?.simulation_at)return {dryRun:true,externalSent:false,message:already.message,notice:'Esta simulação já foi concluída. Nenhuma nova mensagem foi enviada.'};
 // One short claim transaction; never hold a SQL transaction open during an external API call.
 const claimed=await transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${account}:queue`]);
  const quota=(await db.query<{hour:string;day:string;last:Date|null}>(`SELECT COUNT(*) FILTER(WHERE simulation_at>NOW()-INTERVAL '1 hour')::text AS hour,COUNT(*)::text AS day,MAX(simulation_at) AS last FROM offers.distribution_queue WHERE account_id=$1 AND channel=(SELECT channel FROM offers.distribution_queue WHERE account_id=$1 AND id=$2) AND simulation_at>=date_trunc('day',NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,[account,queueId])).rows[0];
  if(Number(quota?.hour)>=settings.maximumPerHour||Number(quota?.day)>=settings.maximumPerDay||(quota?.last&&Date.now()-quota.last.getTime()<settings.minimumIntervalMinutes*60000))throw new AppError('DISTRIBUTION_LIMIT');
  const row=(await db.query<QueueRow>(`UPDATE offers.distribution_queue SET state='validating',attempts=attempts+1,lease_until=NOW()+INTERVAL '2 minutes',last_error_code=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND state IN('queued','ready','failed') AND scheduled_at<=NOW() AND attempts<3 AND simulation_at IS NULL AND EXISTS(SELECT 1 FROM offers.distribution_offers o WHERE o.id=offers.distribution_queue.offer_id AND o.account_id=$1 AND o.approved AND o.state NOT IN('disabled','expired','candidate')) RETURNING *`,[account,queueId])).rows[0];
  if(!row)throw new AppError('QUEUE_CONFLICT');return row;
 });
 try{
  const campaign=claimed.campaign?(await campaigns()).find(c=>c.label===claimed.campaign):undefined;
  if(claimed.campaign&&(!campaign?.enabled||campaign.channel!==claimed.channel))throw new AppError('OFFER_NOT_READY');
  const current=await prepareOffer(owner,{product_id:claimed.product_id,channel:claimed.channel,campaign:claimed.campaign,approved:true,template:campaign?.template??'complete'},claimed.offer_id,{minimumScore:Math.max(settings.minimumScore,campaign?.minimum_score??0),resendHours:campaign?.interval_hours});
  if(campaign?.category&&(await storedProducts([claimed.product_id]))[0]?.category!==campaign.category)throw new AppError('OFFER_NOT_READY');
  if(current.state!=='ready_to_send'||!current.message||current.scoring.score<settings.minimumScore)throw new AppError('OFFER_NOT_READY');
  return await transaction(async db=>{
   // Re-read the server kill switch, source offer and affiliate under locks before finalizing.
   const locked=await db.query<{config:Record<string,unknown>}>('SELECT config FROM offers.settings WHERE account_id=$1 FOR SHARE',[account]);
   const cfg=locked.rows[0]?.config;
   if(!cfg||cfg.paused!==false||cfg.distributionEnabled!==true)throw new AppError('AUTOMATION_PAUSED');
   const offer=(await db.query<{affiliate_url:string;affiliate_link_id:string;price_cents:string;score:number;message:string}>(`SELECT l.affiliate_url,o.* FROM offers.distribution_offers o JOIN offers.affiliate_links l ON l.id=o.affiliate_link_id AND l.account_id=o.account_id JOIN offers.affiliate_channels c ON c.account_id=o.account_id AND c.channel=o.channel WHERE o.account_id=$1 AND o.id=$2 AND o.state='ready_to_send' AND o.revalidated_at>NOW()-INTERVAL '5 minutes' AND l.status='verified' AND l.own_link_confirmed AND c.enabled AND c.public_channel AND c.declared_in_program FOR SHARE OF o,l,c`,[account,claimed.offer_id])).rows[0];
   if(!offer)throw new AppError('OFFER_NOT_READY');officialAffiliateUrl(offer.affiliate_url);
   const updated=await db.query(`UPDATE offers.distribution_queue SET state='ready',simulation_at=NOW(),message=$3,price_snapshot=$4,score_snapshot=$5,affiliate_link_id=$6,lease_until=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND state='validating' AND lease_until>NOW() RETURNING id`,[account,queueId,offer.message,offer.price_cents,offer.score,offer.affiliate_link_id]);
   if(updated.rowCount!==1)throw new AppError('QUEUE_CONFLICT');
   return {dryRun:true,externalSent:false,message:offer.message,notice:'Esta mensagem seria enviada. Simulação concluída; nenhum envio externo ocorreu.'};
  });
 }catch(error){
  const code=error instanceof AppError?error.code:'DISTRIBUTION_FAILED';
  await affiliateQuery(`UPDATE offers.distribution_queue SET state='failed',last_error_code=$3,lease_until=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND state='validating'`,[account,queueId,code]);
  if(['CONNECTION_MISSING','SEARCH_RATE_LIMITED','MELI_SEARCH_FORBIDDEN','MELI_PRICES_FORBIDDEN'].includes(code))await affiliateQuery(`INSERT INTO offers.settings(account_id,config) VALUES($1,'{"paused":true}') ON CONFLICT(account_id) DO UPDATE SET config=offers.settings.config||'{"paused":true}'::jsonb,updated_at=NOW()`,[account]);
  console.warn('DISTRIBUTION_FAILED',{code});throw error;
 }
}
// External sending is intentionally unavailable until an official adapter is configured.
export class WhatsAppOfficialProvider {async send():Promise<never>{throw new AppError('PROVIDER_NOT_CONFIGURED');}}
export class WhatsAppGroupProvider extends WhatsAppOfficialProvider {}
export class TelegramProvider extends WhatsAppOfficialProvider {}
export function newLeaseId(){return randomUUID();}
