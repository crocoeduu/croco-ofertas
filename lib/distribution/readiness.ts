import type { AffiliateResolution, Product } from '../offers/contracts';
import type { OfferScore } from '../offers/scoring';
export type OfferState='candidate'|'approved'|'affiliate_pending'|'ready_to_send'|'sent'|'disabled';
export interface SendHistory {lastSentAt:Date;lastSentPrice:number;lastSentScore:number;verifiedCouponId?:string|null}
export interface DistributionPolicy {minimumScore:number;resendHours:number;priceDropPercent:number;scoreIncrease:number}
export const defaultPolicy:DistributionPolicy={minimumScore:60,resendHours:24,priceDropPercent:5,scoreIncrease:10};
export function resendReason(product:Product,score:number,last:SendHistory|null,policy=defaultPolicy,now=new Date(),verifiedCouponId?:string):string|null {
  if(!last)return 'Primeiro envio';
  const age=now.getTime()-last.lastSentAt.getTime();
  if(age<3600000)return null; // Even significant changes cannot generate rapid repeated sends.
  if(age>=policy.resendHours*3600000)return 'Intervalo configurado atingido';
  if(product.price<=last.lastSentPrice*(1-policy.priceDropPercent/100))return 'Queda relevante de preço';
  if(verifiedCouponId&&verifiedCouponId!==last.verifiedCouponId)return 'Novo cupom verificado';
  if(score>=last.lastSentScore+policy.scoreIncrease)return 'Aumento significativo do score';
  return null;
}
export function offerReadiness(input:{product:Product;scoring:OfferScore;affiliate:AffiliateResolution;approved:boolean;available:boolean;checkedAt:Date;channelConfigured:boolean;last:SendHistory|null;policy?:DistributionPolicy},now=new Date()):{state:OfferState;reasons:string[]} {
  const policy=input.policy??defaultPolicy;
  if(!input.approved)return {state:'candidate',reasons:['Aguarda aprovação administrativa']};
  if(input.affiliate.status!=='affiliate_ready')return {state:'affiliate_pending',reasons:['Link afiliado pendente']};
  const reasons:string[]=[];
  if(!input.available)reasons.push('Disponibilidade não confirmada');
  const age=now.getTime()-input.checkedAt.getTime();if(!Number.isFinite(age)||age<0||age>300000)reasons.push('Preço precisa de nova consulta oficial');
  if(!input.channelConfigured)reasons.push('Canal público declarado no programa precisa ser configurado');
  if(input.scoring.score<policy.minimumScore)reasons.push(`Score abaixo do mínimo (${policy.minimumScore})`);
  if(!resendReason(input.product,input.scoring.score,input.last,policy,now))reasons.push('Reenvio bloqueado pela deduplicação');
  return {state:reasons.length?'approved':'ready_to_send',reasons};
}
