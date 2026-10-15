import 'server-only';
import {affiliateAccount,affiliateQuery,affiliateDashboard} from '../affiliates/repository';
import {storedProducts,getSettings,auditRows} from './repository';
import {listWatchlist,notifications} from './watchlist';
import {campaigns} from './campaigns';
import {listPriceHistories} from '../offers/repository';
import {scoreOffer} from '../offers/scoring';
import {AffiliateLinkService} from '../affiliates/service';
import {listChannels,listPreparedOffers} from '../distribution/service';
import {queueRows} from '../distribution/queue';
export async function opportunities(owner:string){
 const products=await storedProducts();const [history,links]=await Promise.all([listPriceHistories(owner,products.map(p=>p.id)),new AffiliateLinkService().forProducts(products,'site')]);
 return products.map(p=>({...p,scoring:scoreOffer(p,history.get(p.id)??[]),affiliate:links.get(p.id)??{status:'affiliate_pending' as const}})).sort((a,b)=>b.scoring.score-a.scoring.score);
}
export async function workspaceData(owner:string,section:string){
 if(section==='settings'){const [settings,audit,channels,jobs,campaignList]=await Promise.all([getSettings(),auditRows(),listChannels(),affiliateQuery('SELECT name,last_finished_at,last_error_code,processed FROM offers.jobs WHERE account_id=$1',[affiliateAccount()]),campaigns()]);return {settings,audit,channels,jobs,campaigns:campaignList};}
 if(section==='queue'){const [queue,settings,campaignList]=await Promise.all([queueRows(),getSettings(),campaigns()]);return {queue,settings,campaigns:campaignList};}
 const [products,watchlist,notices,analytics,offers,settings,campaignList]=await Promise.all([opportunities(owner),listWatchlist(),notifications(),affiliateDashboard(),listPreparedOffers(),getSettings(),campaigns()]);
 const histories=await affiliateQuery<{count:string}>(`SELECT COUNT(DISTINCT h.product_id)::text AS count FROM offers.price_observations h JOIN public.meli_connections c ON c.owner_hash=h.owner_hash WHERE c.user_id=$1`,[affiliateAccount()]);
 return {products,watchlist,notifications:notices,analytics,offers,settings,campaigns:campaignList,historyProducts:Number(histories[0]?.count??0)};
}
