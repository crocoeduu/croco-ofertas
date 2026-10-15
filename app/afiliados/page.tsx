import type {Metadata} from 'next';
import {adminPageContext} from '@/lib/operations/page-context';
import {affiliateDashboard,listAffiliateLinks} from '@/lib/affiliates/repository';
import {opportunities} from '@/lib/operations/dashboard';
import {AffiliateAdmin} from '@/components/affiliate-admin';
import {WorkspaceShell} from '@/components/workspace-shell';
import {ProductImage} from '@/components/product-image';
export const dynamic='force-dynamic';export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{product_id?:string}>}){
 const c=await adminPageContext();if(!c.authorized)return <WorkspaceShell><section className="intro"><h1>Acesso administrativo</h1><p>Use sua conta administradora autorizada no servidor.</p><a href="/api/mercadolivre/login">Conectar Mercado Livre →</a></section></WorkspaceShell>;
 const params=await searchParams;const productId=typeof params.product_id==='string'&&/^MLB[0-9]{6,18}$/.test(params.product_id)?params.product_id:'';
 let data;try{data=await Promise.all([listAffiliateLinks(),affiliateDashboard(),opportunities(c.owner)]);}catch{return <WorkspaceShell><section className="notice"><h1>Afiliados indisponíveis</h1><p>Não foi possível carregar esta seção. Tente novamente em instantes.</p></section></WorkspaceShell>;}
 const [links,analytics,products]=data;const product=products.find(p=>p.id===productId);
 return <WorkspaceShell><section className="intro"><div className="eyebrow">PROGRAMA DE AFILIADOS DO MERCADO LIVRE</div><h1>Seus links. <span>Suas ofertas.</span></h1><p>Gere na sua conta, cadastre uma vez e reutilize por canal.</p></section>
 <AffiliateAdmin key={productId} initialLinks={links} initialDashboard={analytics} productId={productId} product={product}/>
 <section className="offer-section"><h2>Produtos que precisam do seu link</h2><p className="offer-help">Anúncios coletados pelo Croco sem link afiliado pronto para o site. Escolha o produto para preencher o cadastro automaticamente.</p><div className="products-grid">{products.filter(p=>p.affiliate.status==='affiliate_pending').slice(0,12).map(p=><article className="product-card" key={p.id}><ProductImage src={p.imageUrl} title={p.name}/><h3>{p.name}</h3><strong>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(p.price)}</strong><p>Score {p.scoring.score} · {p.id}</p><a className="product-link" href={`/afiliados?product_id=${p.id}#links`}>Adicionar meu link afiliado →</a></article>)}</div>{!products.length&&<div className="empty-state">Encontre seu primeiro produto no Radar. <a href="/radar">Buscar produtos →</a></div>}</section>
 </WorkspaceShell>;
}
