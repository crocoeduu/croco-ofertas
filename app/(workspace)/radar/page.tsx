import {adminPageContext} from '@/lib/operations/page-context';
import {OffersExplorer} from '@/components/offers-explorer';
export const dynamic='force-dynamic';
export default async function Page(){const c=await adminPageContext();if(!c.authorized)return null;return <><section className="intro"><div className="eyebrow">ENCONTRE E COMPARE</div><h1>Radar de <span>Ofertas.</span></h1><p>Produtos reais, histórico próprio e decisões com evidência.</p></section><OffersExplorer connected/></>;}
