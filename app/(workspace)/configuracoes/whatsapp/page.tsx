import {adminPageContext} from '@/lib/operations/page-context';
import {whatsappDashboard} from '@/lib/whatsapp/configuration';
import {deliveryRows} from '@/lib/whatsapp/delivery';
import {listPreparedOffers} from '@/lib/distribution/service';
import {WhatsAppPanel} from '@/components/whatsapp-panel';
export const dynamic='force-dynamic';
export default async function WhatsAppPage(){
 const c=await adminPageContext();if(!c.authorized)return null;
 let data;try{data=await Promise.all([whatsappDashboard(),deliveryRows(),listPreparedOffers()]);}catch{return <section className="notice"><h1>WhatsApp indisponível</h1><p>A configuração não pôde ser consultada. Nenhum envio será realizado.</p><a href="/dashboard">Voltar ao dashboard</a></section>;}
 const [dashboard,queue,offers]=data;
 return <><section className="intro"><div className="eyebrow">DISTRIBUIÇÃO CROCO</div><h1>WhatsApp</h1><p>Conectar, escolher destino e revisar. Envio real bloqueado por padrão.</p></section><WhatsAppPanel initial={{dashboard,queue}} offers={offers}/></>;
}
