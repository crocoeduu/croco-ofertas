export type ProviderId = 'mercadolivre' | 'shopee';
export interface Product {
  provider: ProviderId; id: string; name: string; price: number; currency: string;
  previousPrice?: number; soldQuantity?: number; reputation?: string;
  shipping?: { free?: boolean; cost?: number }; imageUrl?: string; permalink: string; category?: string;
  condition?: 'new' | 'used' | 'not_specified';
}
export interface PriceObservation { productId: string; provider: ProviderId; price: number; currency: string; observedAt: Date; condition?: Product['condition'] }
export interface MercadoLivreSearchService { search(query: string): Promise<Product[]> }
export interface PriceHistoryService { record(observation: PriceObservation): Promise<void>; list(provider: ProviderId, productId: string): Promise<PriceObservation[]> }
export interface OfferScoringService { score(product: Product, history: PriceObservation[]): Promise<{ score: number; reasons: string[]; sufficientHistory: boolean }> }
export interface AffiliateLinkProvider { createLink(product: Product): Promise<string> }
export interface AffiliateLinkService { forProduct(product: Product): Promise<string> }
export interface CouponService { find(product: Product): Promise<Array<{ code: string; expiresAt?: Date; verified: boolean }>> }
export interface DistributionProvider { send(offer: { product: Product; affiliateUrl: string }, destinationId: string): Promise<void> }
