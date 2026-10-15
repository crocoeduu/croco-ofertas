import Link from 'next/link';
import { cookies } from 'next/headers';
import { CrocoMark, Arrow, Shield } from '@/components/icons';
import { hasConnection } from '@/lib/mercadolivre/tokens';
import { digest } from '@/lib/crypto';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const jar = await cookies();
  const session = jar.get('__Host-croco_session')?.value ?? (process.env.NODE_ENV !== 'production' ? jar.get('croco_session')?.value : undefined);
  let connected = false; let unavailable = false;
  if (session && /^[A-Za-z0-9_-]{43}$/.test(session)) {
    try { connected = await hasConnection(digest(session)); } catch { unavailable = true; }
  }
  const params = await searchParams;
  const authorized = params.connection === 'authorized-not-stored';
  return <div className="shell">
    <header className="header"><Link className="brand" href="/" aria-label="Croco Ofertas, início"><span className="brand-mark"><CrocoMark /></span><span>Croco<span className="brand-light">Ofertas</span></span></Link><span className="header-label"><span className="tiny-dot" /> SUA CENTRAL DE CONEXÕES</span></header>
    <main>
      <section className="intro"><div className="eyebrow"><span /> BOAS OFERTAS COMEÇAM AQUI</div><h1>Central de <span>Ofertas.</span></h1><p>Conecte suas plataformas.<br className="mobile-break" /> Prepare o caminho para encontrar boas oportunidades.</p></section>
      {authorized && <div className="notice" role="status"><strong>Mercado Livre autorizado com sucesso.</strong><span>Armazenamento persistente ainda não configurado. A conexão não foi salva; conecte novamente após configurar o banco.</span></div>}
      {unavailable && <div className="notice" role="status">Não foi possível verificar sua conexão agora. Tente novamente mais tarde.</div>}
      <section className="connection-section" aria-labelledby="connections-title"><div className="section-heading"><h2 id="connections-title">Suas conexões</h2><span>01 plataforma disponível</span></div>
        <article className="connection-card"><div className="card-top"><div className="market-icon" aria-hidden="true"><svg viewBox="0 0 64 44" fill="none"><ellipse cx="32" cy="22" rx="29" ry="18" fill="#fff9c4" stroke="#29364e" strokeWidth="2"/><path d="m12 23 10-8 10 2 8-2 12 8-9 9-7-2-4 2-6-3-4 1-10-7Z" fill="white" stroke="#29364e" strokeWidth="1.8" strokeLinejoin="round"/><path d="m23 16 8 1-5 5c-2 3 2 5 4 3l5-4 9 9M23 26l5 5m1-9 10 9" stroke="#29364e" strokeWidth="1.8" strokeLinecap="round"/></svg></div><span className={`status ${connected ? 'connected' : ''}`}><span />{connected ? 'Conectado' : 'Não conectado'}</span></div>
          <h3>Mercado Livre</h3><p className="card-description">O primeiro passo para a sua<br />central de ofertas afiliadas.</p><div className="card-divider"/><div className="card-note"><Shield /><span>Autorização segura pela sua conta</span></div><a className="connect-button" href="/api/mercadolivre/login">{connected ? 'RECONECTAR MERCADO LIVRE' : 'CONECTAR MERCADO LIVRE'}<Arrow /></a><p className="permission-note">Você escolhe as permissões no Mercado Livre.</p>
        </article>
        <aside className="future-card"><div className="future-icon" aria-hidden="true">⌕</div><span className="future-label">RADAR DE OFERTAS</span><h3>Encontre produtos.<br />Acompanhe os preços.</h3><p>Consulte o Mercado Livre, comece seu histórico e compare oportunidades com um score explicado.</p><div className="future-tags"><span>Produtos</span><span>Histórico de preços</span><span>Cupons</span></div><Link className="radar-link" href="/dashboard">ABRIR RADAR DE OFERTAS <Arrow/></Link></aside>
      </section>
      <div className="trust-note"><Shield /><p>Conexões protegidas. Credenciais sempre no servidor.</p></div>
    </main>
    <footer><span>© {new Date().getFullYear()} Croco Ofertas</span><span>Uma boa oferta começa com uma boa base.</span><a href="/api/health">Status do sistema <span className="tiny-dot" /></a></footer>
  </div>;
}
