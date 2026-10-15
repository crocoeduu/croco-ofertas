import 'server-only';
import {affiliateAccount,affiliateQuery} from '../affiliates/repository';
import {affiliateChannel,campaignLabel} from '../affiliates/validation';
import {storedProducts} from './repository';
import {listPriceHistories} from '../offers/repository';
import {scoreOffer} from '../offers/scoring';
import {productId} from '../offers/validation';
import {AppError} from '../errors';
export async function approveCandidate(owner:string,body:Record<string,unknown>){
 if(Object.keys(body).some(k=>!['product_id','channel','campaign','approved'].includes(k))||typeof body.approved!=='boolean')throw new AppError('REQUEST_INVALID');
 const id=productId(body.product_id),channel=affiliateChannel(body.channel??'site'),campaign=campaignLabel(body.campaign??'');if(channel==='generic')throw new AppError('REQUEST_INVALID');
 const [p]=await storedProducts([id]);if(!p)throw new AppError('PRODUCT_NOT_FOUND');const history=await listPriceHistories(owner,[id]);const scoring=scoreOffer(p,history.get(id)??[]);
 await affiliateQuery(`INSERT INTO offers.distribution_offers(account_id,owner_hash,marketplace,product_id,channel,campaign,state,approved,price_cents,score,available,reasons) VALUES($1,$2,'mercadolivre',$3,$4,$5,$6,$7,$8,$9,FALSE,'["Revalidar preço, estoque e link antes da divulgação"]') ON CONFLICT(account_id,marketplace,product_id,channel,campaign) DO UPDATE SET approved=EXCLUDED.approved,state=EXCLUDED.state,message=NULL,reasons=EXCLUDED.reasons,updated_at=NOW()`,[affiliateAccount(),owner,id,channel,campaign,body.approved?'approved':'candidate',body.approved,Math.round(p.price*100),scoring.score]);
 return {state:body.approved?'approved':'candidate',scoring};
}
