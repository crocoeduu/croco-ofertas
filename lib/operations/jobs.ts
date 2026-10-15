import 'server-only';
import {randomUUID} from 'node:crypto';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {AffiliateLinkService} from '../affiliates/service';
import {getSettings,storedProducts} from './repository';
import {listWatchlist,notifyWatch} from './watchlist';
import {revalidateMercadoLivre} from '../mercadolivre/search';
import {recordProducts,listPriceHistories} from '../offers/repository';
import {scoreOffer} from '../offers/scoring';
import {retryDelay} from './policy';
import {AppError} from '../errors';
export async function runCollection(owner:string){
 const account=affiliateAccount();const settings=await getSettings();if(!settings.watchlistEnabled)throw new AppError('AUTOMATION_PAUSED');
 const lease=randomUUID();
 const claim=await affiliateQuery(`INSERT INTO offers.jobs(account_id,name,lease_id,lease_until,last_started_at) VALUES($1,'collection',$2,NOW()+INTERVAL '2 minutes',NOW()) ON CONFLICT(account_id,name) DO UPDATE SET lease_id=EXCLUDED.lease_id,lease_until=EXCLUDED.lease_until,last_started_at=NOW(),processed=0,last_error_code=NULL WHERE (offers.jobs.lease_until IS NULL OR offers.jobs.lease_until<NOW()) AND (offers.jobs.last_started_at IS NULL OR offers.jobs.last_started_at<NOW()-INTERVAL '1 hour') RETURNING name`,[account,lease]);
 if(!claim.length)throw new AppError('JOB_BUSY');
 let processed=0;let lastError:string|null=null;
 try{
  const due=await affiliateQuery<{product_id:string}>(`SELECT product_id FROM offers.watchlist WHERE account_id=$1 AND active AND failures<3 AND next_check_at<=NOW() ORDER BY next_check_at LIMIT $2`,[account,settings.collectionBudget]);
  const watch=await listWatchlist();
  for(const row of due){
   // Lease bound + small budget avoids unbounded work and duplicate serverless runs.
   const alive=await affiliateQuery('SELECT 1 FROM offers.jobs WHERE account_id=$1 AND name=$2 AND lease_id=$3 AND lease_until>NOW()',[account,'collection',lease]);if(!alive.length)throw new AppError('JOB_BUSY');
   const w=watch.find(w=>w.product_id===row.product_id);if(!w)continue;
   try{
    const current=await revalidateMercadoLivre(owner,row.product_id);await recordProducts(owner,[current.product]);
    const [histories,links]=await Promise.all([listPriceHistories(owner,[row.product_id]),new AffiliateLinkService().forProduct(current.product,'site')]);
    await notifyWatch(w,{...current.product,available:current.available,updatedAt:current.checkedAt.toISOString()},scoreOffer(current.product,histories.get(row.product_id)??[]),links);
    await affiliateQuery(`UPDATE offers.watchlist SET last_checked_at=NOW(),next_check_at=NOW()+make_interval(hours=>$3),failures=0,last_error_code=NULL,updated_at=NOW() WHERE account_id=$1 AND product_id=$2`,[account,row.product_id,settings.watchIntervalHours]);processed++;
   }catch(error){
    const code=error instanceof AppError?error.code:'JOB_FAILED';lastError=code;
    await affiliateQuery(`UPDATE offers.watchlist SET last_checked_at=NOW(),next_check_at=NOW()+($3::bigint*INTERVAL '1 millisecond'),failures=failures+1,last_error_code=$4,updated_at=NOW() WHERE account_id=$1 AND product_id=$2`,[account,row.product_id,retryDelay(w.failures+1),code]);
    if(['CONNECTION_MISSING','SEARCH_RATE_LIMITED','MELI_SEARCH_FORBIDDEN','MELI_PRICES_FORBIDDEN'].includes(code)){
     await affiliateQuery(`INSERT INTO offers.settings(account_id,config) VALUES($1,'{"paused":true,"watchlistEnabled":false}') ON CONFLICT(account_id) DO UPDATE SET config=offers.settings.config||'{"paused":true,"watchlistEnabled":false}'::jsonb,updated_at=NOW()`,[account]);break;
    }
   }
  }
  await cleanup();
  return {processed,budget:settings.collectionBudget,lastError,externalSent:false};
 }catch(error){lastError=error instanceof AppError?error.code:'JOB_FAILED';console.warn('JOB_FAILED',{code:lastError});throw error;}
 finally{await affiliateQuery('UPDATE offers.jobs SET lease_until=NULL,last_finished_at=NOW(),processed=$3,last_error_code=$4 WHERE account_id=$1 AND name=$2 AND lease_id=$5',[account,'collection',processed,lastError,lease]);}
}
export async function cleanup(){
 // Only expirable security buckets. No connections, tokens, useful history or affiliate rows are deleted.
 await affiliateQuery('DELETE FROM public.used_oauth_states WHERE state_hash IN(SELECT state_hash FROM public.used_oauth_states WHERE expires_at<NOW() LIMIT 1000)');
 await affiliateQuery('DELETE FROM public.rate_limit_buckets WHERE (key,bucket) IN(SELECT key,bucket FROM public.rate_limit_buckets WHERE expires_at<NOW() LIMIT 1000)');
 await affiliateQuery(`UPDATE offers.distribution_queue SET state=CASE WHEN state='validating' THEN 'failed' ELSE 'expired' END,last_error_code='STALE',lease_until=NULL,updated_at=NOW() WHERE account_id=$1 AND ((state='validating' AND lease_until<NOW()) OR (state IN('draft','queued','ready') AND created_at<NOW()-INTERVAL '24 hours'))`,[affiliateAccount()]);
 await affiliateQuery(`UPDATE offers.distribution_offers SET state='expired',message=NULL,updated_at=NOW() WHERE account_id=$1 AND state IN('candidate','approved','affiliate_pending','ready_to_send','queued') AND updated_at<NOW()-INTERVAL '24 hours'`,[affiliateAccount()]);
}
export async function updateWatchFromSearch(owner:string,ids:string[]){
 if(!ids.length)return;
 const [watches,products,histories]=await Promise.all([listWatchlist(),storedProducts(ids),listPriceHistories(owner,ids)]);const links=await new AffiliateLinkService().forProducts(products,'site');
 for(const watch of watches.filter(w=>w.active&&ids.includes(w.product_id))){const product=products.find(p=>p.id===watch.product_id);if(!product)continue;await notifyWatch(watch,product,scoreOffer(product,histories.get(product.id)??[]),links.get(product.id)??{status:'affiliate_pending'});await affiliateQuery('UPDATE offers.watchlist SET last_checked_at=NOW(),updated_at=NOW() WHERE account_id=$1 AND id=$2',[affiliateAccount(),watch.id]);}
}
