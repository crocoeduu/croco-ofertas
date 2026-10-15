import {adminPageContext} from '@/lib/operations/page-context';
import {workspaceData} from '@/lib/operations/dashboard';
import {OperationsPanel} from '@/components/operations-panel';
export const dynamic='force-dynamic';
export default async function Page(){const c=await adminPageContext();if(!c.authorized)return null;let data;try{data=await workspaceData(c.owner,'queue');}catch{return <section className="notice"><h1>Seção indisponível</h1><p>Não foi possível consultar esta seção agora. Sua conexão permanece salva.</p><a href="/dashboard">Voltar ao dashboard</a></section>;}return <><section className="intro"><div className="eyebrow">CROCO OFERTAS</div><h1>Preparar. Revisar. Simular.</h1><p>Sua fila persistente, com controle e sem envio externo.</p></section><OperationsPanel section="queue" initial={data}/></>;}
