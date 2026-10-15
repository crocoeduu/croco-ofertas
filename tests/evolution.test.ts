import {afterEach,describe,expect,it,vi} from 'vitest';
import {originalProductUrl,registeredAffiliateUrl,validateAffiliate} from '@/lib/affiliates/validation';
import {effectiveSettings,safeDefaults,validateSettings,withinWindow,retryDelay} from '@/lib/operations/policy';
import {historySummary} from '@/lib/offers/history';
import {scoreOffer} from '@/lib/offers/scoring';
import {previewAffiliateCsv} from '@/lib/affiliates/csv';
import {MessageComposer} from '@/lib/distribution/message-composer';
import type {Product} from '@/lib/offers/contracts';
const id='MLB4609951889';
const original='https://www.mercadolivre.com.br/alaxe-caixa-de-som-inteligente-comando-voz-portatil-bluetoot/up/MLBU3898009017?pdp_filters=item_id%3AMLB4609951889';
const full=original+'&extra_comm=true&brand_comm=false#polycard_client=affiliates&wid=MLB4609951889&sid=affiliates';
const product:Product={provider:'mercadolivre',id,name:'Produto confirmado',price:100,currency:'BRL',condition:'new',permalink:original};
const now=new Date('2026-10-15T15:00:00Z');
afterEach(()=>vi.unstubAllEnvs());
describe('destinos e atribuição são conceitos separados',()=>{
 it('preserva exatamente a URL fornecida somente como pendente',()=>{expect(originalProductUrl(original,id)).toBe(original);expect(registeredAffiliateUrl(full,id,'pending')).toBe(full);expect(()=>registeredAffiliateUrl(full,id,'verified')).toThrow('AFFILIATE_INVALID');expect(validateAffiliate({marketplace:'mercadolivre',product_id:id,original_url:original,affiliate_url:full,channel:'site',status:'pending'}).affiliateUrl).toBe(full);});
 it.each([full.replace('wid=MLB4609951889','wid=MLB123456789'),full.replace('item_id%3AMLB4609951889','item_id%3AMLB123456789'),full+'&wid=MLB4609951889',original.replace('MLB4609951889','MLB4609951889evil')])('bloqueia produto divergente ou ambíguo',url=>expect(()=>registeredAffiliateUrl(url,id,'pending')).toThrow());
 it.each(['https://mercadolivre.com.br.evil.test/p/MLB4609951889','https://evilmercadolivre.com/p/MLB4609951889','https://user:pass@www.mercadolivre.com.br/p/MLB4609951889','https://www.mercadolivre.com.br:444/p/MLB4609951889','javascript:alert(1)','data:text/html,test','file:///test','https://meli.la.evil.test/unconfirmed'])('rejeita destino não autorizado',url=>expect(()=>registeredAffiliateUrl(url,id,'pending')).toThrow());
 it('catálogo exige vínculo previamente coletado no servidor',()=>{const url='https://www.mercadolivre.com.br/p/MLB987654321';expect(()=>originalProductUrl(url,id)).toThrow();expect(originalProductUrl(url,id,'MLB987654321')).toBe(url);});
 it('CSV rejeita fórmulas e nunca ativa link completo',()=>{const header='marketplace,product_id,original_url,affiliate_url,channel,label\n';expect(previewAffiliateCsv(header+`mercadolivre,${id},${original},${full},site,`,new Set()).canImport).toBe(true);const result=previewAffiliateCsv(header+`mercadolivre,${id},${original},https://mercadolivre.com/sec/Example1,site,=HYPERLINK(1)`,new Set());expect(result.canImport).toBe(false);});
});
describe('configurações fail closed',()=>{
 it('manual, pausado, DRY RUN e sem WhatsApp por padrão',()=>{expect(effectiveSettings({})).toMatchObject({paused:true,dryRun:true,autoApprovalEnabled:false,whatsappEnabled:false,distributionEnabled:false});});
 it.each([{dryRun:false},{whatsappEnabled:true},{autoApprovalEnabled:true},{windowStart:22,windowEnd:8},{maximumPerDay:999},{collectionBudget:0},{unknown:true},{paused:'false'}])('recusa configuração insegura ou inválida',body=>expect(()=>validateSettings(body)).toThrow());
 it('flags do servidor podem suspender uma funcionalidade',()=>{vi.stubEnv('WATCHLIST_ENABLED','false');vi.stubEnv('DISTRIBUTION_ENABLED','false');expect(effectiveSettings({watchlistEnabled:true,distributionEnabled:true})).toMatchObject({watchlistEnabled:false,distributionEnabled:false});});
 it('janela em São Paulo e backoff são limitados',()=>{expect(withinWindow(safeDefaults,new Date('2026-10-15T10:00:00Z'))).toBe(false);expect(withinWindow(safeDefaults,new Date('2026-10-15T11:00:00Z'))).toBe(true);expect(withinWindow(safeDefaults,new Date('2026-10-16T01:00:00Z'))).toBe(false);expect(retryDelay(2)).toBeGreaterThan(retryDelay(1));expect(retryDelay(100)).toBe(86400000);});
});
describe('evidência de preços e mensagens',()=>{
 it('estatística não inventa dados sem histórico',()=>{expect(historySummary([],100)).toBeNull();const summary=historySummary([{price:120,observedAt:new Date('2026-10-10')},{price:100,observedAt:new Date('2026-10-11')}],90)!;expect(summary).toMatchObject({minimum:100,maximum:120,average:110,count:2,variationPercent:-25});});
 it('desconto anunciado sem queda registrada gera ressalva, sem acusação',()=>{const p={...product,previousPrice:200};const history=[1,2,3].map(day=>({provider:'mercadolivre' as const,productId:id,price:100,currency:'BRL',condition:'new' as const,observedAt:new Date(now.getTime()-day*86400000)}));const score=scoreOffer(p,history,now);expect(score.warnings).toContain('Desconto anunciado não confirmado pelo histórico.');expect(score.breakdown.some(b=>b.label==='Queda no histórico Croco'&&b.points===0)).toBe(true);expect(score.version).toBe('v2');});
 it('produto indisponível não recebe pontuação',()=>expect(scoreOffer({...product,available:false},[],now).score).toBe(0));
 it.each(['short','complete','low_price','moderate'] as const)('modelo %s preserva link, publicidade e dados confirmados',template=>{const url='https://mercadolivre.com/sec/Example1';const text=new MessageComposer().compose({state:'ready_to_send',product,available:true,checkedAt:now,scoring:scoreOffer(product,[],now),affiliate:{status:'affiliate_ready',id:'12345678-1234-4123-8123-123456789012',affiliateUrl:url,clickPath:'/go/mercadolivre/id',channel:'site',label:'',provenance:'administrator_registered'},template},now);expect(text).toContain(url);expect(text).toContain('Publicidade');expect(text).not.toMatch(/últimas unidades|acaba hoje|cupom|50%/);});
});
