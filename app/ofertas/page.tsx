import Link from 'next/link';
import { cookies } from 'next/headers';
import { CrocoMark } from '@/components/icons';
import { OffersExplorer, CouponsPanel } from '@/components/offers-explorer';
import { hasConnection } from '@/lib/mercadolivre/tokens';
import { digest } from '@/lib/crypto';
export const dynamic = 'force-dynamic';
export default async function OffersPage() {
  const jar = await cookies();
  const session = jar.get('__Host-croco_session')?.value ?? (process.env.NODE_ENV !== 'production' ? jar.get('croco_session')?.value : undefined);
  let connected = false; let unavailable = false;
  if(session && /^[A-Za-z0-9_-]{43}$/.test(session)) {try {connected=await hasConnection(digest(session));} catch {unavailable=true;}}
  return <div className="shell"><header className="header"><Link className="brand" href="/" aria-label="Croco Ofertas, início"><span className="brand-mark"><CrocoMark/></span><span>Croco<span className="brand-light">Ofertas</span></span></Link><Link className="back-link" href="/">Suas conexões →</Link></header>
    <main><section className="intro"><div className="eyebrow"><span/> ENCONTRE E ACOMPANHE</div><h1>Radar de <span>Ofertas.</span></h1><p>Produtos reais. Histórico próprio.<br/>Compare oportunidades com critérios claros.</p></section>
      {unavailable && <div className="notice" role="alert">Não foi possível verificar sua conexão agora. Tente novamente mais tarde.</div>}
      <OffersExplorer connected={connected}/><CouponsPanel connected={connected}/>
      <section className="notice"><strong>Próximas integrações</strong><span>Links afiliados e distribuição no WhatsApp entram depois da validação da busca e dos preços. Os links atuais abrem o anúncio original; nenhum envio automático está ativo.</span></section>
    </main><footer><span>© {new Date().getFullYear()} Croco Ofertas</span><Link href="/">Central de conexões</Link></footer></div>;
}
