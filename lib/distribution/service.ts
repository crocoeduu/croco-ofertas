import 'server-only';
import { transaction } from '../database';
import { AppError } from '../errors';
import { revalidateMercadoLivre } from '../mercadolivre/search';
import { listPriceHistories, recordProducts } from '../offers/repository';
import { productId } from '../offers/validation';
import { scoreOffer } from '../offers/scoring';
import { AffiliateLinkService } from '../affiliates/service';
import { affiliateAccount, affiliateQuery } from '../affiliates/repository';
import { affiliateChannel, affiliateId, campaignLabel } from '../affiliates/validation';
import type { AffiliateChannel } from '../offers/contracts';
import { defaultPolicy, offerReadiness, type DistributionPolicy, type OfferState } from './readiness';
import { MessageComposer } from './message-composer';

export interface ChannelConfig extends DistributionPolicy {channel:AffiliateChannel;enabled:boolean;public_channel:boolean;declared_in_program:boolean}
type ChannelRow={channel:AffiliateChannel;enabled:boolean;public_channel:boolean;declared_in_program:boolean;minimum_score:number;resend_hours:number;price_drop_percent:number;score_increase:number};
function config(row:ChannelRow):ChannelConfig{return {...row,minimumScore:row.minimum_score,resendHours:row.resend_hours,priceDropPercent:row.price_drop_percent,scoreIncrease:row.score_increase};}
export async function listChannels():Promise<ChannelConfig[]> {return (await affiliateQuery<ChannelRow>('SELECT * FROM offers.affiliate_channels WHERE account_id=$1',[affiliateAccount()])).map(config);}
export async function saveChannel(body:Record<string,unknown>):Promise<void> {
  if(Object.keys(body).some(key=>!['channel','enabled','public_channel','declared_in_program','minimumScore','resendHours','priceDropPercent','scoreIncrease'].includes(key)))throw new AppError('REQUEST_INVALID');
  const channel=affiliateChannel(body.channel);if(channel==='generic'||typeof body.enabled!=='boolean'||typeof body.public_channel!=='boolean'||typeof body.declared_in_program!=='boolean'||(body.enabled&&(!body.public_channel||!body.declared_in_program)))throw new AppError('AFFILIATE_INVALID');
  const policy={...defaultPolicy,...Object.fromEntries(Object.keys(defaultPolicy).filter(key=>key in body).map(key=>[key,body[key]]))};
  if(!Number.isInteger(policy.minimumScore)||policy.minimumScore<1||policy.minimumScore>100||!Number.isInteger(policy.resendHours)||policy.resendHours<1||policy.resendHours>720||!Number.isInteger(policy.priceDropPercent)||policy.priceDropPercent<1||policy.priceDropPercent>90||!Number.isInteger(policy.scoreIncrease)||policy.scoreIncrease<1||policy.scoreIncrease>100)throw new AppError('REQUEST_INVALID');
  await affiliateQuery(`INSERT INTO offers.affiliate_channels (account_id,channel,enabled,public_channel,declared_in_program,minimum_score,resend_hours,price_drop_percent,score_increase) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (account_id,channel) DO UPDATE SET enabled=EXCLUDED.enabled,public_channel=EXCLUDED.public_channel,declared_in_program=EXCLUDED.declared_in_program,minimum_score=EXCLUDED.minimum_score,resend_hours=EXCLUDED.resend_hours,price_drop_percent=EXCLUDED.price_drop_percent,score_increase=EXCLUDED.score_increase,updated_at=NOW()`,[affiliateAccount(),channel,body.enabled,body.public_channel,body.declared_in_program,policy.minimumScore,policy.resendHours,policy.priceDropPercent,policy.scoreIncrease]);
}
export async function listPreparedOffers() {
  return affiliateQuery<{id:string;product_id:string;channel:string;campaign:string;state:OfferState;price_cents:string;score:number;revalidated_at:Date;reasons:string[]}>(`SELECT o.id,o.product_id,o.channel,o.campaign,
    CASE WHEN o.state='ready_to_send' AND (l.status<>'verified' OR l.id IS NULL OR NOT l.own_link_confirmed) THEN 'affiliate_pending'
      WHEN o.state='ready_to_send' AND (o.revalidated_at<NOW()-INTERVAL '5 minutes' OR NOT COALESCE(c.enabled AND c.public_channel AND c.declared_in_program,FALSE)) THEN 'approved' ELSE o.state END AS state,
    o.price_cents,o.score,o.revalidated_at,o.reasons FROM offers.distribution_offers o LEFT JOIN offers.affiliate_links l ON l.id=o.affiliate_link_id AND l.account_id=o.account_id
    LEFT JOIN offers.affiliate_channels c ON c.account_id=o.account_id AND c.channel=o.channel WHERE o.account_id=$1 ORDER BY o.updated_at DESC LIMIT 100`,[affiliateAccount()]);
}
export async function disablePreparedOffer(body:Record<string,unknown>) {
  if(Object.keys(body).some(key=>key!=='id'))throw new AppError('REQUEST_INVALID');
  const rows=await affiliateQuery("UPDATE offers.distribution_offers SET state='disabled',message=NULL,updated_at=NOW() WHERE account_id=$1 AND id=$2 RETURNING id",[affiliateAccount(),affiliateId(body.id)]);
  if(!rows.length)throw new AppError('PRODUCT_NOT_FOUND');
}
export async function prepareOffer(owner:string,body:Record<string,unknown>) {
  if(Object.keys(body).some(key=>!['product_id','channel','campaign','approved'].includes(key))||typeof body.approved!=='boolean')throw new AppError('REQUEST_INVALID');
  const id=productId(body.product_id);const channel=affiliateChannel(body.channel);const campaign=campaignLabel(body.campaign??'');if(channel==='generic')throw new AppError('REQUEST_INVALID');
  // Every preparation, even after a prior approval, re-reads the official listing.
  const current=await revalidateMercadoLivre(owner,id);await recordProducts(owner,[current.product]);
  const [histories,affiliate,channels]=await Promise.all([listPriceHistories(owner,[id]),new AffiliateLinkService().forProduct(current.product,channel,campaign),listChannels()]);
  const scoring=scoreOffer(current.product,histories.get(id)??[]);const selected=channels.find(row=>row.channel===channel);const account=affiliateAccount();
  return transaction(async db=>{
    // Shared product/channel lock prevents concurrent preparation from racing with future dispatch adapters.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${account}:mercadolivre:${id}:${channel}`]);
    const last=(await db.query<{last_sent_at:Date;last_sent_price:string;last_sent_score:number;verified_coupon_id:string|null}>('SELECT * FROM offers.distribution_history WHERE account_id=$1 AND marketplace=$2 AND product_id=$3 AND channel=$4 FOR UPDATE',[account,'mercadolivre',id,channel])).rows[0];
    // Lock the currently active link and channel too: an edit/disable cannot race this decision.
    const activeLink=affiliate.status==='affiliate_ready'?(await db.query("SELECT 1 FROM offers.affiliate_links WHERE id=$1 AND account_id=$2 AND status='verified' AND own_link_confirmed AND affiliate_url=$3 FOR SHARE",[affiliate.id,account,affiliate.affiliateUrl])).rowCount===1:false;
    const activeChannel=selected?.enabled?(await db.query('SELECT 1 FROM offers.affiliate_channels WHERE account_id=$1 AND channel=$2 AND enabled AND public_channel AND declared_in_program FOR SHARE',[account,channel])).rowCount===1:false;
    const resolved=activeLink?affiliate:{status:'affiliate_pending' as const};
    const readiness=offerReadiness({product:current.product,scoring,affiliate:resolved,approved:body.approved as boolean,available:current.available,checkedAt:current.checkedAt,channelConfigured:!!activeChannel,last:last?{lastSentAt:last.last_sent_at,lastSentPrice:Number(last.last_sent_price)/100,lastSentScore:last.last_sent_score,verifiedCouponId:last.verified_coupon_id}:null,policy:selected??defaultPolicy});
    const message=readiness.state==='ready_to_send'?new MessageComposer().compose({state:'ready_to_send',...current,scoring,affiliate:resolved}):null;
    await db.query(`INSERT INTO offers.distribution_offers (account_id,owner_hash,marketplace,product_id,channel,campaign,state,approved,affiliate_link_id,price_cents,score,revalidated_at,available,message,reasons) VALUES ($1,$2,'mercadolivre',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) ON CONFLICT (account_id,marketplace,product_id,channel,campaign) DO UPDATE SET owner_hash=EXCLUDED.owner_hash,state=EXCLUDED.state,approved=EXCLUDED.approved,affiliate_link_id=EXCLUDED.affiliate_link_id,price_cents=EXCLUDED.price_cents,score=EXCLUDED.score,revalidated_at=EXCLUDED.revalidated_at,available=EXCLUDED.available,message=EXCLUDED.message,reasons=EXCLUDED.reasons,updated_at=NOW()`,[account,owner,id,channel,campaign,readiness.state,body.approved,affiliate.status==='affiliate_ready'?affiliate.id:null,Math.round(current.product.price*100),scoring.score,current.checkedAt,current.available,message,JSON.stringify(readiness.reasons)]);
    return {...readiness,scoring,message,revalidatedAt:current.checkedAt};
  });
}
// A future official transport must call prepareOffer again immediately before send,
// honor the same advisory lock, and use an idempotency key. No external sender is enabled.
export interface OfficialDistributionAdapter {send(message:string,destination:string,idempotencyKey:string):Promise<{officialReceipt:string}>}
