import 'server-only';
import {randomUUID} from 'node:crypto';
import {transaction} from '../database';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {affiliateId} from '../affiliates/validation';
import {AffiliateLinkService} from '../affiliates/service';
import {revalidateMercadoLivre} from '../mercadolivre/search';
import {recordProducts,listPriceHistories} from '../offers/repository';
import {scoreOffer} from '../offers/scoring';
import {AppError} from '../errors';
import {accountConfig} from './configuration';
import {WhatsAppMessageComposer,whatsappTemplates,type WhatsAppTemplate,type WhatsAppPayload} from './composer';
import {deliveryPolicy,deliveryReasons,dedupeReason,workerOnline} from './policy';
import {withinWindow} from '../operations/policy';
import {MockDistributionProvider} from './providers';
import {digest} from '../crypto';
interface Source {id:string;product_id:string;campaign:string;approved:boolean;price_cents:string;state:string}
export async function previewWhatsApp(owner:string,offerId:unknown,template:unknown='auto',approvedPrice?:number){
 const id=affiliateId(offerId);if(!whatsappTemplates.includes(template as WhatsAppTemplate))throw new AppError('REQUEST_INVALID');
 const source=(await affiliateQuery<Source>("SELECT id,product_id,campaign,approved,price_cents,state FROM offers.distribution_offers WHERE account_id=$1 AND id=$2 AND channel='whatsapp' AND state NOT IN('disabled','expired','sent')",[affiliateAccount(),id]))[0];if(!source)throw new AppError('OFFER_NOT_READY');
 const a=await accountConfig(),p=deliveryPolicy(a?.policy??{}),current=await revalidateMercadoLivre(owner,source.product_id);
 await recordProducts(owner,[current.product]);
 const [history,affiliate]=await Promise.all([listPriceHistories(owner,[source.product_id]),new AffiliateLinkService().forProduct(current.product,'whatsapp',source.campaign)]);
 const scoring=scoreOffer(current.product,history.get(source.product_id)??[]);
 const evidence={...current,score:scoring.score,drop:scoring.historicalDiscountPercent,approvedPrice:approvedPrice??Number(source.price_cents)/100,affiliateReady:affiliate.status==='affiliate_ready',approved:source.approved};
 const reasons=deliveryReasons(evidence,p);
 const recent=await affiliateQuery<{product_id:string;catalog_product_id:string|null;category:string|null;price_cents:string;score:number;sent_at:Date}>(`SELECT s.* FROM offers.delivery_snapshots s JOIN offers.whatsapp_accounts a ON a.account_id=s.account_id WHERE s.account_id=$1 AND s.destination_id=a.selected_destination ORDER BY s.sent_at DESC LIMIT 50`,[affiliateAccount()]);
 const dedupe=dedupeReason(evidence,p,recent.map(h=>({productId:h.product_id,catalogId:h.catalog_product_id??undefined,category:h.category??undefined,price:Number(h.price_cents)/100,score:h.score,sentAt:h.sent_at})));if(dedupe)reasons.push(dedupe);
 const composed=affiliate.status==='affiliate_ready'&&current.available?new WhatsAppMessageComposer().preview({...current,scoring,affiliate,template:template as WhatsAppTemplate,mediaFailureBehavior:p.mediaFailureBehavior}):null;
 const payload=composed?{...composed,decision:{version:'croco-whatsapp-v1',approved:source.approved,minimumScore:p.minimumScore,reasons:scoring.reasons}}:null;
 return {source,current,scoring,affiliate,payload,reasons,policy:p,destinationId:a?.selected_destination??null,dryRun:true as const,externalSent:false as const};
}
export async function stageWhatsApp(owner:string,body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['offer_id','template','scheduled_at'].includes(k)))throw new AppError('REQUEST_INVALID');
 const result=await previewWhatsApp(owner,body.offer_id,body.template??'auto');
 if(result.reasons.length||!result.payload||result.affiliate.status!=='affiliate_ready'||!result.destinationId)throw new AppError('OFFER_NOT_READY');
 let scheduled=new Date();if(body.scheduled_at!==undefined){if(typeof body.scheduled_at!=='string')throw new AppError('REQUEST_INVALID');scheduled=new Date(body.scheduled_at);if(!Number.isFinite(+scheduled)||+scheduled<Date.now()-5000||+scheduled>Date.now()+7*86400000)throw new AppError('REQUEST_INVALID');}
 if(!withinWindow(result.policy,scheduled))throw new AppError('DISTRIBUTION_WINDOW');
 const payload=result.payload,link=result.affiliate;
 return transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${affiliateAccount()}:wa:queue`]);
  const dest=await db.query(`SELECT d.id FROM offers.whatsapp_destinations d JOIN offers.whatsapp_accounts a ON a.account_id=d.account_id AND a.connection_epoch=d.connection_epoch JOIN offers.affiliate_channels c ON c.account_id=d.account_id AND c.channel='whatsapp' WHERE d.account_id=$1 AND d.id=$2 AND a.selected_destination=d.id AND d.public_confirmed AND d.can_send AND c.enabled AND c.public_channel AND c.declared_in_program FOR SHARE OF a,d,c`,[affiliateAccount(),result.destinationId]);if(dest.rowCount!==1)throw new AppError('OFFER_NOT_READY');
  const active=await db.query("SELECT id FROM offers.affiliate_links WHERE account_id=$1 AND id=$2 AND status='verified' AND own_link_confirmed AND affiliate_url=$3 FOR SHARE",[affiliateAccount(),link.id,link.affiliateUrl]);if(active.rowCount!==1)throw new AppError('AFFILIATE_NOT_FOUND');
  const source=await db.query("SELECT id FROM offers.distribution_offers WHERE account_id=$1 AND id=$2 AND approved AND state NOT IN('disabled','expired','candidate','sent') FOR SHARE",[affiliateAccount(),result.source.id]);if(source.rowCount!==1)throw new AppError('OFFER_NOT_READY');
  const existing=(await db.query<{id:string}>(`SELECT id FROM offers.distribution_queue WHERE account_id=$1 AND destination_id=$2 AND (product_id=$3 OR ($4::text IS NOT NULL AND catalog_product_id=$4)) AND state IN('draft','approved','queued','claimed','validating','ready','sending') FOR UPDATE`,[affiliateAccount(),result.destinationId,payload.productId,result.current.product.catalogId??null])).rows[0];if(existing)return existing;
  return (await db.query<{id:string}>(`INSERT INTO offers.distribution_queue(account_id,offer_id,marketplace,product_id,channel,campaign,affiliate_link_id,message,price_snapshot,score_snapshot,idempotency_key,destination_id,catalog_product_id,category,template_id,message_snapshot,scheduled_at) VALUES($1,$2,'mercadolivre',$3,'whatsapp',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15) RETURNING id`,[affiliateAccount(),result.source.id,payload.productId,result.source.campaign,link.id,payload.text,Math.round(payload.price*100),payload.score,randomUUID(),result.destinationId,result.current.product.catalogId??null,result.current.product.category??null,payload.template,JSON.stringify(payload),scheduled])).rows[0];
 });
}
export async function deliveryRows(){return affiliateQuery<{id:string;offer_id:string;product_id:string;state:string;template_id:string;message:string;message_snapshot:WhatsAppPayload|null;scheduled_at:string;attempts:number;last_error_code:string|null;requires_review:boolean;destination_name:string|null;receipt_status:string|null}>(`SELECT q.id,q.offer_id,q.product_id,q.state,q.template_id,q.message,q.message_snapshot,q.scheduled_at::text,q.attempts,q.last_error_code,q.requires_review,d.name AS destination_name,q.receipt_status FROM offers.distribution_queue q LEFT JOIN offers.whatsapp_destinations d ON d.id=q.destination_id AND d.account_id=q.account_id WHERE q.account_id=$1 AND q.channel='whatsapp' ORDER BY q.created_at DESC LIMIT 100`,[affiliateAccount()]);}
export const claimSql=`WITH picked AS (SELECT q.id FROM offers.distribution_queue q JOIN offers.distribution_offers o ON o.id=q.offer_id AND o.account_id=q.account_id JOIN offers.whatsapp_accounts a ON a.account_id=q.account_id JOIN offers.whatsapp_destinations d ON d.id=q.destination_id AND d.account_id=q.account_id AND d.connection_epoch=a.connection_epoch WHERE q.account_id=$1 AND q.channel='whatsapp' AND q.state IN('queued','ready') AND q.attempts<3 AND q.scheduled_at<=NOW() AND NOT q.requires_review AND o.approved AND o.state NOT IN('disabled','expired','candidate','sent') AND q.destination_id=a.selected_destination AND d.public_confirmed AND d.can_send ORDER BY q.score_snapshot*10+LEAST(100,EXTRACT(EPOCH FROM(NOW()-q.created_at))/3600) DESC,q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1) UPDATE offers.distribution_queue q SET state='claimed',claimed_by=$2,claimed_at=NOW(),lease_expires_at=NOW()+INTERVAL '2 minutes',claim_token=$3,attempts=attempts+1,updated_at=NOW() FROM picked WHERE q.id=picked.id RETURNING q.*`;
export async function claimDelivery(workerId:string){
 const a=await accountConfig();if(!a?.enabled||!workerOnline(a.last_seen_at))return null;
 return transaction(async db=>{
  // Serialize dispatch reservations per account while retaining SKIP LOCKED for competing consumers.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${affiliateAccount()}:wa:claim`]);
  await db.query(`UPDATE offers.distribution_queue SET state='queued',claimed_by=NULL,claim_token=NULL,lease_expires_at=NULL,updated_at=NOW() WHERE account_id=$1 AND channel='whatsapp' AND state IN('claimed','validating') AND lease_expires_at<NOW() AND attempts<3 AND NOT requires_review`,[affiliateAccount()]);
  // A lost receipt after handing off is ambiguous. Never automatically retry it.
  await db.query(`UPDATE offers.distribution_queue SET state='failed',requires_review=TRUE,last_error_code='DELIVERY_AMBIGUOUS',updated_at=NOW() WHERE account_id=$1 AND channel='whatsapp' AND state='sending' AND lease_expires_at<NOW()`,[affiliateAccount()]);
  const row=(await db.query<{id:string;offer_id:string;price_snapshot:string;template_id:string;claim_token:string;attempts:number}>(claimSql,[affiliateAccount(),workerId,randomUUID()])).rows[0];if(row)console.info('QUEUE_CLAIMED');return row??null;
 });
}
export async function simulateDelivery(owner:string,id:unknown){
 const queueId=affiliateId(id),q=(await affiliateQuery<{offer_id:string;price_snapshot:string;template_id:string;state:string}>("SELECT offer_id,price_snapshot,template_id,state FROM offers.distribution_queue WHERE account_id=$1 AND id=$2 AND channel='whatsapp' AND state IN('queued','ready')",[affiliateAccount(),queueId]))[0];if(!q)throw new AppError('QUEUE_CONFLICT');
 const result=await previewWhatsApp(owner,q.offer_id,q.template_id,Number(q.price_snapshot)/100);
 if(result.reasons.length||!result.payload){await affiliateQuery("UPDATE offers.distribution_queue SET state='failed',requires_review=TRUE,last_error_code='REVALIDATION_REQUIRED',updated_at=NOW() WHERE account_id=$1 AND id=$2 AND state IN('queued','ready')",[affiliateAccount(),queueId]);return {dryRun:true,externalSent:false,reasons:result.reasons,payload:null};}
 const receipt=await new MockDistributionProvider().send(result.payload,{id:result.destinationId??'',externalId:'mock-only',kind:'mock'},queueId);
 const updated=await affiliateQuery(`UPDATE offers.distribution_queue SET simulation_at=NOW(),message=$3,message_snapshot=$4::jsonb,payload_digest=$5,updated_at=NOW() WHERE account_id=$1 AND id=$2 AND state IN('queued','ready') RETURNING id`,[affiliateAccount(),queueId,result.payload.text,JSON.stringify(result.payload),digest(JSON.stringify(result.payload))]);if(!updated.length)throw new AppError('QUEUE_CONFLICT');
 return {...receipt,dryRun:true,reasons:[],payload:result.payload};
}
