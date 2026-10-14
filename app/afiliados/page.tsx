import Link from 'next/link';
import { cookies } from 'next/headers';
import { administratorSession } from '@/lib/affiliates/admin';
import { affiliateDashboard, listAffiliateLinks } from '@/lib/affiliates/repository';
import { listChannels, listPreparedOffers } from '@/lib/distribution/service';
import { AffiliateAdmin } from '@/components/affiliate-admin';
export const dynamic='force-dynamic';
export default async function AffiliatesPage({searchParams}:{searchParams:Promise<{product_id?:string}>}) {
  const jar=await cookies();const session=jar.get('__Host-croco_session')?.value??(process.env.NODE_ENV!=='production'?jar.get('croco_session')?.value:undefined);
  let authorized=false;let unavailable=false;
  try{authorized=await administratorSession(session);}catch{unavailable=true;}
  const params=await searchParams;const productId=typeof params.product_id==='string'&&/^MLB[0-9]{6,18}$/.test(params.product_id)?params.product_id:'';
  const data=authorized?await Promise.all([listAffiliateLinks(),affiliateDashboard(),listChannels(),listPreparedOffers()]):null;
  return <div className="shell"><header className="header"><Link className="brand" href="/">Croco<span className="brand-light">Ofertas</span></Link><Link className="back-link" href="/ofertas">Radar de Ofertas →</Link></header><main><section className="intro"><div className="eyebrow"><span/> ADMINISTRAÇÃO</div><h1>Seus links. <span>Suas ofertas.</span></h1><p>Links oficiais cadastrados uma vez.<br/>Reutilização por produto, canal e campanha.</p></section>
    {data?<AffiliateAdmin initialLinks={data[0]} initialDashboard={data[1]} initialChannels={data[2]} initialOffers={data[3].map(row=>({...row,revalidated_at:row.revalidated_at?.toISOString()??''}))} productId={productId}/>:<section className="notice"><h2>Acesso administrativo</h2><p>{unavailable?'Não foi possível verificar seu acesso agora.':'Esta área exige uma sessão ativa da conta administradora autorizada no servidor. Conectar outra conta não concede essa permissão.'}</p><Link href="/api/mercadolivre/login">Conectar minha conta administradora →</Link></section>}
  </main><footer><span>© {new Date().getFullYear()} Croco Ofertas</span><Link href="/">Central de conexões</Link></footer></div>;
}
