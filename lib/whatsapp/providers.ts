import 'server-only';
import {AppError} from '../errors';
import type {DistributionProvider} from '../offers/contracts';
import type {WhatsAppPayload} from './composer';
import {officialAffiliateUrl} from '../affiliates/validation';
export type WhatsAppProviderId='mock'|'cloud'|'groups'|'web_session';
export interface Destination {id:string;externalId:string;kind:'group'|'channel'|'individual'|'mock'}
export interface DispatchReceipt {externalSent:boolean;providerMessageId?:string;status?:'sent'}
export interface WhatsAppDistributionProvider extends DistributionProvider<WhatsAppPayload,DispatchReceipt,Destination> {readonly id:WhatsAppProviderId}
function payloadGuard(p:WhatsAppPayload){if(!p.advertising||!p.text.includes(officialAffiliateUrl(p.affiliateUrl))||!p.text.includes('(anúncio)')||p.text.length>4096)throw new AppError('OFFER_NOT_READY');}
export class MockDistributionProvider implements WhatsAppDistributionProvider {
 readonly id='mock';async send(p:WhatsAppPayload,_d:Destination,_key:string):Promise<DispatchReceipt>{payloadGuard(p);if(_d.kind!=='mock'||!_key)throw new AppError('REQUEST_INVALID');return {externalSent:false};}
}
// Official capabilities are isolated. No guessed group endpoints or implicit individual sends.
export class WhatsAppCloudProvider implements WhatsAppDistributionProvider {
 readonly id:WhatsAppProviderId='cloud';async send(_p:WhatsAppPayload,_d:Destination,_key:string):Promise<DispatchReceipt>{if(!_p||!_d||!_key)throw new AppError('PROVIDER_NOT_CONFIGURED');throw new AppError('PROVIDER_NOT_CONFIGURED');}
}
export class WhatsAppGroupsProvider extends WhatsAppCloudProvider {override readonly id='groups' as const;}
export class WhatsAppWebSessionProvider implements WhatsAppDistributionProvider {
 readonly id='web_session';constructor(private readonly transport:{send(p:WhatsAppPayload,d:Destination,key:string):Promise<DispatchReceipt>},private readonly enabled=false){}
 async send(p:WhatsAppPayload,d:Destination,key:string):Promise<DispatchReceipt>{payloadGuard(p);if(!this.enabled||process.env.WHATSAPP_WEB_SESSION_ENABLED!=='true'||process.env.WHATSAPP_SEND_ENABLED!=='true')throw new AppError('AUTOMATION_PAUSED');if(!['group','channel'].includes(d.kind))throw new AppError('REQUEST_INVALID');return this.transport.send(p,d,key);}
}
