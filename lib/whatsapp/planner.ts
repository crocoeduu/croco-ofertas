import 'server-only';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {storedProducts} from '../operations/repository';
import {listPriceHistories} from '../offers/repository';
import {scoreOffer} from '../offers/scoring';
import {AffiliateLinkService} from '../affiliates/service';
import {accountConfig} from './configuration';
import {deliveryPolicy,realSendEnabled,workerOnline} from './policy';
import {withinWindow} from '../operations/policy';
import {prepareOffer} from '../distribution/service';
import {stageWhatsApp} from './delivery';
import {randomUUID} from 'node:crypto';
export async function planAutomaticOffer(){
 if(!realSendEnabled())return;
 const a=await accountConfig();if(!a?.enabled||a.paused||a.status!=='connected'||!workerOnline(a.last_seen_at))return;
 const p=deliveryPolicy(a.policy);if(p.approvalMode!=='automatic'||!withinWindow(p))return;
 const lease=randomUUID();
 const job=await affiliateQuery(`INSERT INTO offers.jobs(account_id,name,lease_id,lease_until,last_started_at) VALUES($1,'whatsapp_planner',$2,NOW()+INTERVAL '2 minutes',NOW()) ON CONFLICT(account_id,name) DO UPDATE SET lease_id=$2,lease_until=NOW()+INTERVAL '2 minutes',last_started_at=NOW() WHERE offers.jobs.lease_until<NOW() AND offers.jobs.last_started_at<NOW()-INTERVAL '15 minutes' RETURNING lease_id`,[affiliateAccount(),lease]);if(!job.length)return;
 try{
  const [owner]=await affiliateQuery<{owner_hash:string}>(`SELECT owner_hash FROM public.meli_connections WHERE user_id=$1 AND session_expires_at>NOW() ORDER BY updated_at DESC LIMIT 1`,[affiliateAccount()]);if(!owner)return;
  const products=await storedProducts();const history=await listPriceHistories(owner.owner_hash,products.map(x=>x.id));
  const candidates=products.map(product=>({product,score:scoreOffer(product,history.get(product.id)??[])})).filter(x=>x.score.score>=p.minimumScore&&x.product.available!==false).sort((a,b)=>b.score.score-a.score.score).slice(0,10);
  if(!candidates.length)return;
  const links=await new AffiliateLinkService().forProducts(candidates.map(x=>x.product),'whatsapp');
  for(const candidate of candidates.filter(x=>links.get(x.product.id)?.status!=='affiliate_ready').slice(0,5))await affiliateQuery(`INSERT INTO offers.notifications(account_id,product_id,kind,event_key) VALUES($1,$2,'affiliate_pending',$3) ON CONFLICT DO NOTHING`,[affiliateAccount(),candidate.product.id,`whatsapp:affiliate_pending:${candidate.product.id}:${new Date().toISOString().slice(0,10)}`]);
  const candidate=candidates.find(x=>links.get(x.product.id)?.status==='affiliate_ready');if(!candidate)return;
  // Explicit automatic approval is a separate policy from offer score and monetization readiness.
  const prepared=await prepareOffer(owner.owner_hash,{product_id:candidate.product.id,channel:'whatsapp',approved:true,template:'complete'},undefined,{minimumScore:p.minimumScore});
  if(prepared.state==='ready_to_send')await stageWhatsApp(owner.owner_hash,{offer_id:prepared.id,template:'auto'});
 }catch(error){await affiliateQuery('UPDATE offers.whatsapp_accounts SET paused=TRUE,updated_at=NOW() WHERE account_id=$1',[affiliateAccount()]);console.warn('QUEUE_REVALIDATION_FAILED');throw error;}finally{await affiliateQuery(`UPDATE offers.jobs SET lease_until=NOW(),last_finished_at=NOW() WHERE account_id=$1 AND name='whatsapp_planner' AND lease_id=$2`,[affiliateAccount(),lease]);}
}
