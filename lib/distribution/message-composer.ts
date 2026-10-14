import type { AffiliateResolution, Product } from '../offers/contracts';
import type { OfferScore } from '../offers/scoring';
import { AppError } from '../errors';
import { officialAffiliateUrl } from '../affiliates/validation';
export class MessageComposer {
  compose(input:{state:'ready_to_send';product:Product;scoring:OfferScore;affiliate:AffiliateResolution;available:boolean;checkedAt:Date},now=new Date()):string {
    if(input.state!=='ready_to_send'||input.affiliate.status!=='affiliate_ready'||!input.available||now.getTime()-input.checkedAt.getTime()>300000||input.checkedAt>now||!Number.isFinite(input.product.price)||input.product.price<=0)throw new AppError('OFFER_NOT_READY');
    const product=input.product;const url=officialAffiliateUrl(input.affiliate.affiliateUrl);
    const money=(price:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(price);
    if(product.currency!=='BRL')throw new AppError('OFFER_NOT_READY');
    const lines=['🔥 OFERTA ENCONTRADA','',[...product.name].map(char=>char.charCodeAt(0)<32?' ':char).join('').slice(0,300),''];
    if(product.previousPrice&&product.previousPrice>product.price)lines.push(`Preço anterior informado no anúncio: ${money(product.previousPrice)}`);
    lines.push(`Por ${money(product.price)}`);
    if(input.scoring.sufficientHistory&&input.scoring.historicalDiscountPercent!==null&&input.scoring.historicalDiscountPercent>0)lines.push(`📉 ${input.scoring.historicalDiscountPercent}% abaixo da mediana do histórico Croco`);
    if(product.shipping?.free===true)lines.push('🚚 Anúncio informa frete grátis; confirme para seu CEP');
    lines.push('','👉 Ver oferta:',url,'','Publicidade · Link afiliado. Podemos receber comissão em compras elegíveis, sem custo adicional.','Preço, estoque, frete e condições sujeitos à confirmação no Mercado Livre.');
    // Manual coupons never enter the message, price or score without an official verification adapter.
    return lines.join('\n');
  }
}
