import type {NextRequest} from 'next/server';
import {requireAdministrator} from '@/lib/affiliates/admin';
import {readOfferBody,offerJson,offerError} from '@/lib/offers/security';
import {whatsappDashboard,configureWhatsApp,connectionCommand,chooseDestination,pauseWhatsApp,confirmDestination} from '@/lib/whatsapp/configuration';
import {deliveryRows,previewWhatsApp,stageWhatsApp,simulateDelivery} from '@/lib/whatsapp/delivery';
import {cancelQueue} from '@/lib/distribution/queue';
import {authorizeFirstTest,enableAuto} from '@/lib/whatsapp/dispatch';
import {AppError} from '@/lib/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:NextRequest){try{await requireAdministrator(request);if(request.nextUrl.search)throw new AppError('REQUEST_INVALID');return offerJson({dashboard:await whatsappDashboard(),queue:await deliveryRows()});}catch(e){return offerError(e);}}
export async function POST(request:NextRequest){try{
 const owner=await requireAdministrator(request,true);if(request.nextUrl.search)throw new AppError('REQUEST_INVALID');const {action,...body}=await readOfferBody(request,8192);
 if(action==='configure'){await configureWhatsApp(body);return offerJson({saved:true});}
 if(['connect','disconnect','delete_session','pause'].includes(String(action))){if(Object.keys(body).length)throw new AppError('REQUEST_INVALID');if(action==='pause')await pauseWhatsApp();else await connectionCommand(action as 'connect'|'disconnect'|'delete_session');return offerJson({saved:true});}
 if(action==='destination'){if(Object.keys(body).some(k=>!['id','public_confirmed'].includes(k)))throw new AppError('REQUEST_INVALID');await chooseDestination(body.id,body.public_confirmed);return offerJson({saved:true});}
 if(action==='confirm_destination'){if(Object.keys(body).some(k=>k!=='id'))throw new AppError('REQUEST_INVALID');await confirmDestination(body.id);return offerJson({saved:true});}
 if(action==='preview'){if(Object.keys(body).some(k=>!['offer_id','template'].includes(k)))throw new AppError('REQUEST_INVALID');const r=await previewWhatsApp(owner,body.offer_id,body.template??'auto');return offerJson({payload:r.payload,reasons:r.reasons,destinationId:r.destinationId,dryRun:true,externalSent:false});}
 if(action==='stage')return offerJson(await stageWhatsApp(owner,body));
 if(['simulate','cancel'].includes(String(action))){if(Object.keys(body).some(k=>k!=='id'))throw new AppError('REQUEST_INVALID');if(action==='simulate')return offerJson(await simulateDelivery(owner,body.id));await cancelQueue(body.id);return offerJson({saved:true});}
 // First real send must be separately authorized after a concrete destination/preview exists.
 if(action==='authorize_test'){if(Object.keys(body).some(k=>k!=='phrase'))throw new AppError('REQUEST_INVALID');await authorizeFirstTest(body.phrase);return offerJson({authorized:true});}
 if(action==='enable_auto'){if(Object.keys(body).length)throw new AppError('REQUEST_INVALID');await enableAuto();return offerJson({saved:true});}
 if(action==='send_now')throw new AppError('AUTOMATION_PAUSED');
 throw new AppError('REQUEST_INVALID');
}catch(e){return offerError(e);}}
