import 'server-only';
import {storedProducts} from '../operations/repository';
import {validateAffiliate} from './validation';
export async function validateRegisteredAffiliate(body:Record<string,unknown>){
 // Trusted catalog binding is read from persisted API data, never accepted from the browser.
 let catalog:string|undefined;
 if(typeof body.product_id==='string'&&/^MLB[0-9]{6,18}$/.test(body.product_id))catalog=(await storedProducts([body.product_id]))[0]?.catalogId;
 return validateAffiliate(body,catalog);
}
