import 'server-only';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {affiliateChannel,campaignLabel} from '../affiliates/validation';
import {AppError} from '../errors';
export type Campaign={id:string;label:string;channel:string;minimum_score:number;category:string|null;interval_hours:number;approval_mode:'manual'|'automatic';template:'short'|'complete'|'low_price'|'moderate';enabled:boolean};
export async function campaigns(){return affiliateQuery<Campaign>('SELECT id,label,channel,minimum_score,category,interval_hours,approval_mode,template,enabled FROM offers.campaigns WHERE account_id=$1 ORDER BY label',[affiliateAccount()]);}
export async function saveCampaign(body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['label','channel','minimumScore','category','intervalHours','template','enabled'].includes(k)))throw new AppError('REQUEST_INVALID');
 const label=campaignLabel(body.label),channel=affiliateChannel(body.channel),score=body.minimumScore??60,interval=body.intervalHours??24,template=body.template??'complete',category=body.category||null;
 if(!label||channel==='generic'||typeof score!=='number'||!Number.isInteger(score)||score<1||score>100||typeof interval!=='number'||!Number.isInteger(interval)||interval<1||interval>720||!['short','complete','low_price','moderate'].includes(String(template))||typeof body.enabled!=='boolean'||(category!==null&&(typeof category!=='string'||!/^MLB[0-9]{1,18}$/.test(category))))throw new AppError('REQUEST_INVALID');
 await affiliateQuery(`INSERT INTO offers.campaigns(account_id,label,channel,minimum_score,category,interval_hours,template,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(account_id,label) DO UPDATE SET channel=EXCLUDED.channel,minimum_score=EXCLUDED.minimum_score,category=EXCLUDED.category,interval_hours=EXCLUDED.interval_hours,template=EXCLUDED.template,enabled=EXCLUDED.enabled,updated_at=NOW()`,[affiliateAccount(),label,channel,score,category,interval,template,body.enabled]);
}
