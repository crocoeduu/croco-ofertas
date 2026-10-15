import type {NextRequest} from 'next/server';
import {requireAdministrator} from '@/lib/affiliates/admin';
import {offerJson,offerError,readOfferBody} from '@/lib/offers/security';
import {workspaceData} from '@/lib/operations/dashboard';
import {saveSettings,getSettings,storedProducts} from '@/lib/operations/repository';
import {saveWatch,markRead} from '@/lib/operations/watchlist';
import {saveCampaign,campaigns} from '@/lib/operations/campaigns';
import {approveCandidate} from '@/lib/operations/workflow';
import {runCollection} from '@/lib/operations/jobs';
import {enqueue,cancelQueue,simulateQueue} from '@/lib/distribution/queue';
import {prepareOffer} from '@/lib/distribution/service';
import {affiliateAccount,affiliateQuery} from '@/lib/affiliates/repository';
import {AppError} from '@/lib/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:NextRequest){try{const owner=await requireAdministrator(request);const section=request.nextUrl.searchParams.get('section')??'dashboard';if(!['dashboard','watchlist','offers','queue','settings'].includes(section)||[...request.nextUrl.searchParams.keys()].some(k=>k!=='section')||request.nextUrl.searchParams.getAll('section').length>1)throw new AppError('REQUEST_INVALID');return offerJson(await workspaceData(owner,section));}catch(error){return offerError(error);}}
export async function POST(request:NextRequest){try{
 const owner=await requireAdministrator(request,true);if(request.nextUrl.search)throw new AppError('REQUEST_INVALID');const {action,...body}=await readOfferBody(request,8192);
 if(action==='watch')return offerJson(await saveWatch(body));
 if(action==='settings')return offerJson(await saveSettings(body));
 if(action==='pause'){if(Object.keys(body).length)throw new AppError('REQUEST_INVALID');return offerJson(await saveSettings({...await getSettings(),paused:true}));}
 if(action==='notification'){if(Object.keys(body).some(k=>k!=='id'))throw new AppError('REQUEST_INVALID');await markRead(body.id);return offerJson({saved:true});}
 if(action==='campaign'){await saveCampaign(body);return offerJson({saved:true});}
 if(action==='approve')return offerJson(await approveCandidate(owner,body));
 if(action==='prepare'){
  const campaign=body.campaign?(await campaigns()).find(c=>c.label===body.campaign):undefined;
  if(body.campaign&&(!campaign||!campaign.enabled||campaign.channel!==body.channel))throw new AppError('REQUEST_INVALID');
  const settings=await getSettings();const result=await prepareOffer(owner,{...body,template:campaign?.template??body.template??'complete'},undefined,{minimumScore:Math.max(settings.minimumScore,campaign?.minimum_score??0),resendHours:campaign?.interval_hours});
  if(campaign&&(result.scoring.score<campaign.minimum_score||(campaign.category&&(await storedProducts([String(body.product_id)]))[0]?.category!==campaign.category))){
   await affiliateQuery(`UPDATE offers.distribution_offers SET state='approved',message=NULL,reasons='["Critérios da campanha não atendidos"]',updated_at=NOW() WHERE account_id=$1 AND id=$2`,[affiliateAccount(),result.id]);return offerJson({...result,state:'approved',message:null,reasons:['Critérios da campanha não atendidos']});
  }
  return offerJson(result);
 }
 if(action==='collect'){if(Object.keys(body).length)throw new AppError('REQUEST_INVALID');return offerJson(await runCollection(owner));}
 if(['enqueue','cancel','simulate'].includes(String(action))){if(Object.keys(body).some(k=>k!=='id'))throw new AppError('REQUEST_INVALID');if(action==='enqueue')return offerJson(await enqueue(body.id));if(action==='cancel'){await cancelQueue(body.id);return offerJson({saved:true});}return offerJson(await simulateQueue(owner,body.id));}
 throw new AppError('REQUEST_INVALID');
}catch(error){return offerError(error);}}
