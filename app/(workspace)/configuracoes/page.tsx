import {adminPageContext} from '@/lib/operations/page-context';
import {workspaceData} from '@/lib/operations/dashboard';
import {OperationsPanel} from '@/components/operations-panel';
export const dynamic='force-dynamic';
export default async function Page(){const c=await adminPageContext();if(!c.authorized)return null;let data;try{data=await workspaceData(c.owner,'settings');}catch{return <section className="notice"><h1>Seção indisponível</h1><p>Não foi possível consultar esta seção agora. Sua conexão permanece salva.</p><a href="/dashboard">Voltar ao dashboard</a></section>;}return <><section className="intro"><div className="eyebrow">CROCO OFERTAS</div><h1>Seu Croco, sob controle.</h1><p>Limites, segurança e preferências no servidor.</p></section><OperationsPanel section="settings" initial={data}/></>;}
