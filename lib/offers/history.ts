import type {PriceObservation} from './contracts';
export function historySummary(history:Pick<PriceObservation,'price'|'observedAt'>[],currentPrice:number){
 const valid=history.filter(h=>Number.isFinite(h.price)&&h.price>0&&Number.isFinite(h.observedAt.getTime())).sort((a,b)=>a.observedAt.getTime()-b.observedAt.getTime());
 if(!valid.length)return null;
 const prices=valid.map(h=>h.price);const first=valid[0];const last=valid.at(-1)!;
 return {minimum:Math.min(...prices),maximum:Math.max(...prices),average:prices.reduce((a,b)=>a+b,0)/prices.length,count:valid.length,first:first.observedAt,last:last.observedAt,variationPercent:(currentPrice-first.price)/first.price*100};
}
