import type { Product, PriceObservation } from './contracts';
export interface OfferScore {
  score: number; reasons: string[]; sufficientHistory: boolean; historyDays: number;
  baselinePrice: number | null; historicalDiscountPercent: number | null; advertisedDiscountPercent: number | null;
  version: 'v1';
}
const round = (value: number) => Math.round(value * 100) / 100;
function median(values: number[]): number { const sorted = [...values].sort((a,b) => a-b); const mid = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2; }
export function scoreOffer(product: Product, history: PriceObservation[], now = new Date()): OfferScore {
  const today = now.toISOString().slice(0,10); const days = new Map<string, number[]>();
  for (const observation of history) {
    const age = now.getTime() - observation.observedAt.getTime();
    if (observation.productId !== product.id || observation.provider !== product.provider || observation.currency !== product.currency || observation.condition !== product.condition || age < 0 || age > 30*86400_000 || !Number.isFinite(observation.price) || observation.price <= 0) continue;
    const day = observation.observedAt.toISOString().slice(0,10);
    if (day === today) continue; // Repeating searches today cannot manufacture historical evidence.
    const samples = days.get(day) ?? []; samples.push(observation.price); days.set(day,samples);
  }
  const sufficientHistory = days.size >= 3;
  const baselinePrice = sufficientHistory ? round(median([...days.values()].map(median))) : null;
  const historicalDiscountPercent = baselinePrice ? round((baselinePrice-product.price)/baselinePrice*100) : null;
  const advertisedDiscountPercent = product.previousPrice && product.previousPrice > product.price ? round((product.previousPrice-product.price)/product.previousPrice*100) : null;
  const reasons: string[] = []; let score = 0;
  if (historicalDiscountPercent !== null) {
    score += Math.min(65, Math.max(0, historicalDiscountPercent*2));
    reasons.push(historicalDiscountPercent > 0 ? `${historicalDiscountPercent}% abaixo da mediana dos preços coletados.` : 'Preço atual não está abaixo da mediana do histórico.');
  } else reasons.push(`Histórico em formação: ${days.size}/3 dias anteriores com coleta.`);
  if (advertisedDiscountPercent !== null) { score += Math.min(20,advertisedDiscountPercent); reasons.push(`${advertisedDiscountPercent}% de desconto informado no anúncio; não comprova queda histórica.`); }
  if (product.shipping?.free === true) { score += 10; reasons.push('Anúncio informa frete grátis; confirme para seu CEP.'); }
  if (product.condition === 'new') score += 5;
  if (!sufficientHistory) score = Math.min(score,35);
  return { score: Math.round(Math.max(0,Math.min(100,score))), reasons, sufficientHistory, historyDays: days.size, baselinePrice, historicalDiscountPercent, advertisedDiscountPercent, version:'v1' };
}
