import {AppError} from '../errors';
import type {Product} from '../offers/contracts';
import {qualityModes} from './ui-contract';
export {qualityModes} from './ui-contract';
export interface DeliveryPolicy {approvalMode:'manual'|'automatic';qualityMode:keyof typeof qualityModes;minimumScore:number;minimumDrop:number;minimumPrice:number;maximumPrice:number;minimumIntervalMinutes:number;maximumPerHour:number;maximumPerDay:number;windowStart:number;windowEnd:number;resendHours:number;priceDropPercent:number;scoreIncrease:number;priceChangeThreshold:number;diversityWindow:number;mediaFailureBehavior:'send_text_only'|'require_review';freeShipping:boolean;officialStoreOnly:boolean;allowedCategories:string[];blockedCategories:string[];blockedWords:string[];blockedSellers:string[];blockedProducts:string[]}
export const defaultDeliveryPolicy:DeliveryPolicy={approvalMode:'manual',qualityMode:'conservative',...qualityModes.conservative,minimumDrop:0,minimumPrice:0,maximumPrice:1000000,windowStart:8,windowEnd:22,resendHours:24,priceDropPercent:5,scoreIncrease:10,priceChangeThreshold:3,diversityWindow:3,mediaFailureBehavior:'send_text_only',freeShipping:false,officialStoreOnly:false,allowedCategories:[],blockedCategories:[],blockedWords:[],blockedSellers:[],blockedProducts:[]};
export function deliveryPolicy(input:Record<string,unknown>):DeliveryPolicy {
 if(Object.keys(input).some(k=>!Object.hasOwn(defaultDeliveryPolicy,k)))throw new AppError('REQUEST_INVALID');
 const mode=input.qualityMode??'conservative';if(!Object.hasOwn(qualityModes,String(mode)))throw new AppError('REQUEST_INVALID');
 const p={...defaultDeliveryPolicy,...qualityModes[mode as keyof typeof qualityModes],...input} as DeliveryPolicy;
 const limits:Record<string,[number,number]>={minimumScore:[1,100],minimumDrop:[0,90],minimumPrice:[0,1000000],maximumPrice:[1,1000000],minimumIntervalMinutes:[15,1440],maximumPerHour:[1,4],maximumPerDay:[1,30],windowStart:[0,23],windowEnd:[1,24],resendHours:[1,720],priceDropPercent:[1,90],scoreIncrease:[1,100],priceChangeThreshold:[0,50],diversityWindow:[0,10]};
 for(const [k,[lo,hi]] of Object.entries(limits)){const n=p[k as keyof DeliveryPolicy];if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi||!Number.isInteger(n))throw new AppError('REQUEST_INVALID');}
 if(!['manual','automatic'].includes(p.approvalMode))throw new AppError('REQUEST_INVALID');
 if(p.windowStart>=p.windowEnd||p.minimumPrice>p.maximumPrice||typeof p.freeShipping!=='boolean'||typeof p.officialStoreOnly!=='boolean'||!['send_text_only','require_review'].includes(p.mediaFailureBehavior))throw new AppError('REQUEST_INVALID');
 for(const k of ['allowedCategories','blockedCategories','blockedWords','blockedSellers','blockedProducts'] as const){if(!Array.isArray(p[k])||p[k].length>50||p[k].some(x=>typeof x!=='string'||!x.trim()||x.length>100||/[\p{Cc}]/u.test(x)))throw new AppError('REQUEST_INVALID');}
 return p;
}
export interface DeliveryEvidence {product:Product;score:number;drop:number|null;checkedAt:Date;approvedPrice:number;available:boolean;affiliateReady:boolean;approved:boolean}
export function deliveryReasons(e:DeliveryEvidence,p:DeliveryPolicy,now=new Date()):string[]{
 const r:string[]=[];const age=now.getTime()-e.checkedAt.getTime();
 if(!e.approved)r.push('APPROVAL_REQUIRED');if(!e.available)r.push('PRODUCT_UNAVAILABLE');if(!e.affiliateReady)r.push('AFFILIATE_PENDING');
 if(!Number.isFinite(age)||age<0||age>120000)r.push('REVALIDATION_REQUIRED');
 if(e.score<p.minimumScore)r.push('SCORE_TOO_LOW');if(p.minimumDrop>0&&(e.drop===null||e.drop<p.minimumDrop))r.push('DROP_TOO_LOW');
 if(!Number.isFinite(e.product.price)||e.product.price<=0||e.product.currency!=='BRL'||e.product.price<p.minimumPrice||e.product.price>p.maximumPrice)r.push('PRICE_FILTER');
 if(!Number.isFinite(e.approvedPrice)||e.approvedPrice<=0||Math.abs(e.product.price/e.approvedPrice-1)*100>p.priceChangeThreshold)r.push('PRICE_CHANGED_REAPPROVAL');
 if(p.freeShipping&&e.product.shipping?.free!==true)r.push('SHIPPING_FILTER');
 // Official-store evidence isn't supplied by the current listing adapter: fail closed.
 if(p.officialStoreOnly)r.push('OFFICIAL_STORE_UNCONFIRMED');
 if(p.allowedCategories.length&&(!e.product.category||!p.allowedCategories.includes(e.product.category)))r.push('CATEGORY_FILTER');
 if(e.product.category&&p.blockedCategories.includes(e.product.category))r.push('CATEGORY_FILTER');
 if(p.blockedProducts.includes(e.product.id))r.push('PRODUCT_BLOCKED');
 if(p.blockedWords.some(w=>e.product.name.toLocaleLowerCase('pt-BR').includes(w.toLocaleLowerCase('pt-BR'))))r.push('WORD_BLOCKED');
 if(p.blockedSellers.length)r.push('SELLER_UNCONFIRMED');
 return [...new Set(r)];
}
export interface PastDelivery {productId:string;catalogId?:string;category?:string;price:number;score:number;sentAt:Date}
export function dedupeReason(e:DeliveryEvidence,p:DeliveryPolicy,past:PastDelivery[],now=new Date()):string|null {
 const same=past.find(h=>h.productId===e.product.id||(!!e.product.catalogId&&h.catalogId===e.product.catalogId));
 if(same){const elapsed=now.getTime()-same.sentAt.getTime();if(elapsed<3600000)return 'DESTINATION_COOLDOWN';if(elapsed<p.resendHours*3600000&&!(e.product.price<=same.price*(1-p.priceDropPercent/100)||e.score>=same.score+p.scoreIncrease))return 'PRODUCT_CATALOG_DUPLICATE';}
 if(p.diversityWindow&&e.product.category&&past.length>=p.diversityWindow&&past.slice(0,p.diversityWindow).every(h=>h.category===e.product.category)&&e.score<90)return 'CATEGORY_DIVERSITY';
 return null;
}
export function queuePriority(score:number,drop:number,createdAt:Date,now=new Date()):number{return score*10+Math.min(50,Math.max(0,drop))*2+Math.min(100,Math.max(0,(now.getTime()-createdAt.getTime())/3600000));}
export function workerOnline(seen:string|null|undefined,now=new Date()):boolean{const age=now.getTime()-Date.parse(seen??'');return Number.isFinite(age)&&age>=0&&age<90000;}
export function realSendEnabled(env:Record<string,string|undefined>=process.env):boolean{return env.WHATSAPP_SEND_ENABLED==='true'&&env.AUTO_SEND_ENABLED==='true';}
export function retryAt(attempt:number,now=new Date()):Date|null{return attempt>=3?null:new Date(now.getTime()+30000*2**Math.max(0,attempt-1));}
