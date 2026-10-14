import 'server-only';
import type { AffiliateChannel, AffiliateLinkProvider, AffiliateLinkService as ServiceContract, AffiliateResolution, Product } from '../offers/contracts';
import { affiliateChannel, campaignLabel, officialAffiliateUrl } from './validation';
import { findProductLinks, type AffiliateLink } from './repository';

export function selectAffiliateLink(links: AffiliateLink[], product: Product, channel: AffiliateChannel, label = ''): AffiliateResolution {
  affiliateChannel(channel); campaignLabel(label);
  const eligible=links.filter(link=>link.marketplace===product.provider && link.product_id===product.id && link.status==='verified' && link.own_link_confirmed && !!link.verified_at && (label ? link.label===label : true));
  const choose=(selectedChannel:AffiliateChannel)=>{const matches=eligible.filter(link=>link.channel===selectedChannel);return matches.find(link=>link.label===label)??(!label&&matches.length===1?matches[0]:undefined);};
  const selected=choose(channel) ?? choose('generic');
  if (!selected) return {status:'affiliate_pending'};
  try { officialAffiliateUrl(selected.affiliate_url); } catch { return {status:'affiliate_pending'}; }
  return {status:'affiliate_ready',id:selected.id,affiliateUrl:selected.affiliate_url,clickPath:`/go/mercadolivre/${selected.id}${selected.channel==='generic'?`?channel=${channel}`:''}`,channel,label:selected.label,provenance:'administrator_registered'};
}
export class MercadoLivreAffiliateProvider implements AffiliateLinkProvider {
  constructor(private readonly lookup = findProductLinks) {}
  async resolve(product: Product, channel: AffiliateChannel, label = ''): Promise<AffiliateResolution> {
    if (product.provider!=='mercadolivre') return {status:'affiliate_pending'};
    return selectAffiliateLink(await this.lookup([product.id]),product,channel,label);
  }
}
export class AffiliateLinkService implements ServiceContract {
  constructor(private readonly provider: AffiliateLinkProvider = new MercadoLivreAffiliateProvider()) {}
  forProduct(product: Product, channel: AffiliateChannel, label = '') { return this.provider.resolve(product,channel,label); }
  async forProducts(products: Product[], channel: AffiliateChannel, label = ''): Promise<Map<string,AffiliateResolution>> {
    const links=await findProductLinks(products.filter(product=>product.provider==='mercadolivre').map(product=>product.id));
    return new Map(products.map(product=>[product.id,selectAffiliateLink(links,product,channel,label)]));
  }
}
