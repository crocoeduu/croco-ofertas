import type {AffiliateResolution,Product} from '../offers/contracts';
import type {OfferScore} from '../offers/scoring';
import {MessageComposer} from '../distribution/message-composer';
import {officialAffiliateUrl} from '../affiliates/validation';
import {productImageUrl} from '../offers/media';
import {AppError} from '../errors';
import {whatsappTemplates,type WhatsAppTemplate} from './ui-contract';
export {whatsappTemplates,type WhatsAppTemplate} from './ui-contract';
export interface WhatsAppPayload {text:string;imageUrl?:string;template:WhatsAppTemplate;affiliateUrl:string;productId:string;price:number;score:number;checkedAt:string;advertising:true;mediaFailureBehavior:'send_text_only'|'require_review';decision?:{version:string;approved:boolean;minimumScore:number;reasons:string[]}}
export class WhatsAppMessageComposer extends MessageComposer {
 preview(input:{product:Product;scoring:OfferScore;affiliate:AffiliateResolution;available:boolean;checkedAt:Date;template?:WhatsAppTemplate;mediaFailureBehavior?:WhatsAppPayload['mediaFailureBehavior']},now=new Date()):WhatsAppPayload {
  // Reuse the existing availability, freshness, currency and affiliate guards.
  super.compose({...input,state:'ready_to_send',template:'short'},now);
  if(input.affiliate.status!=='affiliate_ready')throw new AppError('OFFER_NOT_READY');
  const url=officialAffiliateUrl(input.affiliate.affiliateUrl),p=input.product;
  let template=input.template??'auto';if(!whatsappTemplates.includes(template))throw new AppError('REQUEST_INVALID');
  const old=p.previousPrice&&Number.isFinite(p.previousPrice)&&p.previousPrice>p.price?p.previousPrice:undefined;
  if(template==='auto')template=old?'discount':input.scoring.sufficientHistory?'complete':'simple';
  const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  // Strip WhatsApp formatting delimiters, invisible controls and line injection from external titles.
  const title=p.name.replace(/[\p{Cc}\p{Cf}*_~`<>]/gu,' ').replace(/\s+/g,' ').trim().slice(0,180);
  const lines=[template==='simple'?`🔥 ${title}`:'🔥 OFERTA ENCONTRADA'];if(template!=='simple')lines.push('',title);
  lines.push('');if(old&&template!=='simple')lines.push(`De: ~${money(old)}~`);
  lines.push(`🔥 ${money(p.price)}`);
  if(template==='discount'&&old)lines.push(`📉 ${Math.floor((1-p.price/old)*100)}% de desconto informado no anúncio`);
  if(template!=='simple'&&p.shipping?.free===true)lines.push('🚚 Anúncio informa frete grátis; confirme seu CEP');
  if(template==='complete'&&input.scoring.sufficientHistory&&(input.scoring.historicalDiscountPercent??0)>0)lines.push(`📉 ${input.scoring.historicalDiscountPercent}% abaixo da mediana registrada pelo Croco`);
  // Current adapter has no independently verified coupon or installment evidence: omit both.
  lines.push('','🛒 Link da oferta:',url,'','(anúncio)');let text=lines.join('\n');
  const imageUrl=productImageUrl(p.imageUrl);const max=imageUrl?1024:4096;
  if(text.length>max)text=`🔥 ${title.slice(0,120)}\n\n${money(p.price)}\n\n${url}\n\n(anúncio)`;
  if(text.length>max||!title)throw new AppError('OFFER_NOT_READY');
  return {text,imageUrl,template,affiliateUrl:url,productId:p.id,price:p.price,score:input.scoring.score,checkedAt:input.checkedAt.toISOString(),advertising:true,mediaFailureBehavior:input.mediaFailureBehavior??'send_text_only'};
 }
}
