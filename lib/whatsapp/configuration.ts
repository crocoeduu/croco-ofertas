import 'server-only';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {affiliateId} from '../affiliates/validation';
import {AppError} from '../errors';
import {transaction} from '../database';
import {deliveryPolicy,workerOnline,realSendEnabled} from './policy';
export interface WhatsAppAccount {provider:'mock'|'cloud'|'groups'|'web_session';enabled:boolean;unofficial_confirmed:boolean;status:string;account_mask:string;connection_epoch:string;command:string;paused:boolean;policy:Record<string,unknown>;last_seen_at:string|null;worker_id:string|null;selected_destination:string|null}
export async function accountConfig():Promise<WhatsAppAccount|undefined>{return (await affiliateQuery<WhatsAppAccount>('SELECT provider,enabled,unofficial_confirmed,status,account_mask,connection_epoch,command,paused,policy,last_seen_at::text,worker_id,selected_destination FROM offers.whatsapp_accounts WHERE account_id=$1',[affiliateAccount()]))[0];}
export async function whatsappDashboard(){
 const account=await accountConfig();
 const [destinations,counts,metrics]=await Promise.all([
 affiliateQuery<{id:string;name:string;kind:string;masked_id:string;public_confirmed:boolean;verified_by_admin:boolean;can_send:boolean}>(`SELECT d.id,d.name,d.kind,('••••'||RIGHT(d.external_id,6)) AS masked_id,d.public_confirmed,d.verified_by_admin,d.can_send FROM offers.whatsapp_destinations d JOIN offers.whatsapp_accounts a ON a.account_id=d.account_id AND a.connection_epoch=d.connection_epoch WHERE d.account_id=$1 ORDER BY d.name LIMIT 100`,[affiliateAccount()]),
 affiliateQuery<{state:string;count:string}>(`SELECT state,COUNT(*)::text AS count FROM offers.distribution_queue WHERE account_id=$1 AND channel='whatsapp' GROUP BY state`,[affiliateAccount()]),
 affiliateQuery<{sent_today:string;failed:string}>(`SELECT COUNT(*) FILTER(WHERE state='sent' AND sent_at>=date_trunc('day',NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')::text AS sent_today,COUNT(*) FILTER(WHERE state='failed')::text AS failed FROM offers.distribution_queue WHERE account_id=$1 AND channel='whatsapp'`,[affiliateAccount()])]);
 return {metrics:metrics[0]??{sent_today:'0',failed:'0'},account:account??null,workerOnline:workerOnline(account?.last_seen_at),destinations,counts,sendEnabled:realSendEnabled(),testSendEnabled:process.env.WHATSAPP_SEND_ENABLED==='true',autoSendEnabled:process.env.AUTO_SEND_ENABLED==='true',webSessionEnabled:process.env.WHATSAPP_WEB_SESSION_ENABLED==='true',workerConfigured:/^[a-f0-9]{64}$/i.test(process.env.WHATSAPP_WORKER_SECRET??''),policy:deliveryPolicy(account?.policy??{})};
}
export async function configureWhatsApp(body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['provider','enabled','unofficial_confirmed','policy'].includes(k))||!['mock','cloud','groups','web_session'].includes(String(body.provider))||typeof body.enabled!=='boolean'||typeof body.unofficial_confirmed!=='boolean'||!body.policy||typeof body.policy!=='object'||Array.isArray(body.policy))throw new AppError('REQUEST_INVALID');
 if(body.enabled&&body.provider==='web_session'&&(body.unofficial_confirmed!==true||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true'))throw new AppError('PROVIDER_NOT_CONFIGURED');
 // Official Groups eligibility and destinations remain unverified: never imply support from IDs alone.
 if(body.enabled&&['cloud','groups'].includes(String(body.provider)))throw new AppError('PROVIDER_NOT_CONFIGURED');
 const policy=deliveryPolicy(body.policy as Record<string,unknown>);
 await transaction(async db=>{
  const prev=(await db.query<{provider:string;enabled:boolean}>('SELECT provider,enabled FROM offers.whatsapp_accounts WHERE account_id=$1 FOR UPDATE',[affiliateAccount()])).rows[0];
  if(prev&&prev.provider!==body.provider&&prev.enabled)throw new AppError('QUEUE_CONFLICT');
  await db.query(`INSERT INTO offers.whatsapp_accounts(account_id,provider,enabled,unofficial_confirmed,policy) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(account_id) DO UPDATE SET provider=EXCLUDED.provider,enabled=EXCLUDED.enabled,unofficial_confirmed=EXCLUDED.unofficial_confirmed,policy=EXCLUDED.policy,paused=TRUE,connection_epoch=CASE WHEN offers.whatsapp_accounts.provider<>EXCLUDED.provider OR NOT EXCLUDED.enabled THEN gen_random_uuid() ELSE offers.whatsapp_accounts.connection_epoch END,selected_destination=CASE WHEN offers.whatsapp_accounts.provider<>EXCLUDED.provider OR NOT EXCLUDED.enabled THEN NULL ELSE offers.whatsapp_accounts.selected_destination END,status=CASE WHEN offers.whatsapp_accounts.provider<>EXCLUDED.provider OR NOT EXCLUDED.enabled THEN 'disconnected' ELSE offers.whatsapp_accounts.status END,qr_encrypted=NULL,qr_expires_at=NULL,command=CASE WHEN NOT EXCLUDED.enabled THEN 'disconnect' ELSE offers.whatsapp_accounts.command END,updated_at=NOW()`,[affiliateAccount(),body.provider,body.enabled,body.unofficial_confirmed,JSON.stringify(policy)]);
 });
}
export async function connectionCommand(command:'connect'|'disconnect'|'delete_session'){
 const a=await accountConfig();if(!a)throw new AppError('PROVIDER_NOT_CONFIGURED');
 if(command==='connect'&&(!a.enabled||a.provider!=='web_session'||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true'))throw new AppError('PROVIDER_NOT_CONFIGURED');
 await affiliateQuery(`UPDATE offers.whatsapp_accounts SET command=$2,paused=TRUE,qr_encrypted=NULL,qr_expires_at=NULL,status=CASE WHEN $2='connect' THEN 'connecting' ELSE 'disconnected' END,selected_destination=CASE WHEN $2='connect' THEN selected_destination ELSE NULL END,connection_epoch=CASE WHEN $2='connect' THEN connection_epoch ELSE gen_random_uuid() END,updated_at=NOW() WHERE account_id=$1`,[affiliateAccount(),command]);
}
export async function chooseDestination(id:unknown,confirmed:unknown){
 if(confirmed!==true)throw new AppError('REQUEST_INVALID');
 await transaction(async db=>{
 const rows=await db.query(`UPDATE offers.whatsapp_accounts a SET selected_destination=d.id,paused=TRUE,updated_at=NOW() FROM offers.whatsapp_destinations d WHERE a.account_id=$1 AND d.account_id=a.account_id AND d.connection_epoch=a.connection_epoch AND d.id=$2 AND d.can_send AND d.last_seen_at>NOW()-INTERVAL '5 minutes' AND a.status='connected' RETURNING d.id`,[affiliateAccount(),affiliateId(id)]);
 if(!rows.rowCount)throw new AppError('PROVIDER_NOT_CONFIGURED');
 await db.query('UPDATE offers.whatsapp_destinations SET public_confirmed=TRUE,declared_at=NOW(),declared_by=$1 WHERE account_id=$1 AND id=$2',[affiliateAccount(),affiliateId(id)]);
 });
}
export async function pauseWhatsApp(){await transaction(async db=>{await db.query('UPDATE offers.whatsapp_accounts SET paused=TRUE,updated_at=NOW() WHERE account_id=$1',[affiliateAccount()]);await db.query("UPDATE offers.whatsapp_test_permits SET state='cancelled' WHERE account_id=$1 AND state IN('pending','sending')",[affiliateAccount()]);});}
export async function confirmDestination(id:unknown){
 const rows=await affiliateQuery(`UPDATE offers.whatsapp_destinations d SET verified_by_admin=TRUE,verified_at=NOW(),verified_by=$1 FROM offers.whatsapp_accounts a WHERE d.account_id=$1 AND a.account_id=d.account_id AND a.selected_destination=d.id AND a.connection_epoch=d.connection_epoch AND d.id=$2 AND d.last_test_at>NOW()-INTERVAL '1 day' AND d.public_confirmed RETURNING d.id`,[affiliateAccount(),affiliateId(id)]);if(!rows.length)throw new AppError('OFFER_NOT_READY');
}
