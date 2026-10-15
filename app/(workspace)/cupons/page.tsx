import {adminPageContext} from '@/lib/operations/page-context';
import {CouponsPanel} from '@/components/offers-explorer';
export const dynamic='force-dynamic';
export default async function Page(){const c=await adminPageContext();if(!c.authorized)return null;return <><section className="intro"><h1>Cupons, com clareza.</h1><p>Seus cadastros manuais ficam não verificados até confirmação oficial.</p></section><CouponsPanel connected/></>;}
