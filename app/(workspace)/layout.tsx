import type {Metadata} from 'next';
import Link from 'next/link';
import {WorkspaceShell} from '@/components/workspace-shell';
import {adminPageContext} from '@/lib/operations/page-context';
export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){const context=await adminPageContext();return <WorkspaceShell>{context.authorized?children:<section className="offer-section notice"><h1>Acesso administrativo</h1><p>{context.unavailable?'Não foi possível verificar a conexão agora. Tente novamente em instantes.':'Conecte sua conta administradora para acompanhar oportunidades e preparar ofertas.'}</p><Link href="/api/mercadolivre/login">Conectar Mercado Livre →</Link></section>}</WorkspaceShell>;}
