import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { normalizeProduct, searchMercadoLivre } from '@/lib/mercadolivre/search';
import { scoreOffer } from '@/lib/offers/scoring';
import { validateCoupon, eligibleCoupons, type Coupon } from '@/lib/offers/coupons';
import { marketUrl, searchQuery } from '@/lib/offers/validation';
import { requireOfferSession, readOfferBody } from '@/lib/offers/security';
import { recordProducts, listPriceHistories, productExists } from '@/lib/offers/repository';
import type { PriceObservation, Product } from '@/lib/offers/contracts';

const mock = vi.hoisted(()=>({token:vi.fn(),connected:vi.fn(),consume:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/mercadolivre/tokens',()=>({getValidAccessToken:mock.token,hasConnection:mock.connected}));
vi.mock('@/lib/rate-limit',()=>({PostgresRateLimit:class {consume=mock.consume;}}));
vi.mock('@/lib/database',()=>({getDatabase:()=>({query:mock.query}),transaction:async(work:(db:{query:typeof mock.query})=>Promise<unknown>)=>work({query:mock.query})}));
const raw={id:'MLB123456789',title:'Fone bluetooth',price:80,original_price:100,currency_id:'BRL',permalink:'http://produto.mercadolivre.com.br/MLB-123456789-fone',thumbnail:'http://http2.mlstatic.com/D_123.jpg',condition:'new',shipping:{free_shipping:true}};
const product:Product={provider:'mercadolivre',id:'MLB123456789',name:'Fone bluetooth',price:80,previousPrice:100,currency:'BRL',permalink:'https://produto.mercadolivre.com.br/MLB-123456789-fone',condition:'new',shipping:{free:true}};
const now=new Date('2026-10-14T15:00:00Z');
const history=(prices:number[]):PriceObservation[]=>prices.map((price,i)=>({provider:'mercadolivre',productId:product.id,price,currency:'BRL',condition:'new',observedAt:new Date(now.getTime()-(i+1)*86400_000)}));
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('MELI_CLIENT_ID','123456');vi.stubEnv('MELI_CLIENT_SECRET','unit-secret-placeholder');vi.stubEnv('MELI_REDIRECT_URI','https://example.com/api/mercadolivre/callback');
  mock.token.mockReset().mockResolvedValue('mock-private-access');mock.connected.mockReset().mockResolvedValue(true);mock.consume.mockReset().mockResolvedValue(true);mock.query.mockReset().mockResolvedValue({rows:[],rowCount:0});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('normalização e API oficial',()=>{
  it('normaliza centavos e URLs sem carregar informações da conta',()=>{
    const result=normalizeProduct({...raw,price:80.123,seller:{access_token:'mock-private-seller'}})!;
    expect(result.price).toBe(80.12);expect(result.previousPrice).toBe(100);expect(result.imageUrl).toMatch(/^https:/);expect(result.permalink).toMatch(/^https:/);expect(result).not.toHaveProperty('seller');
  });
  it.each([{...raw,price:-1},{...raw,price:Infinity},{...raw,price:0},{...raw,currency_id:'USD'},{...raw,id:'MLA123456789'},{...raw,permalink:'https://example.com/fake'},{...raw,permalink:'javascript:alert(1)'}])('descarta anúncio não comparável ou inválido',item=>expect(normalizeProduct(item)).toBeNull());
  it('URLs não aceitam subdomínio falso, credenciais ou imagem arbitrária',()=>{expect(marketUrl('https://produto.mercadolivre.com.br.evil.test')).toBeUndefined();expect(marketUrl('https://user@produto.mercadolivre.com.br')).toBeUndefined();expect(marketUrl('https://example.com/image.jpg',true)).toBeUndefined();});
  it('busca com token privado e parâmetros limitados, sem devolver payload bruto',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({paging:{total:2},results:[raw,raw]}));vi.stubGlobal('fetch',fetcher);
    const result=await searchMercadoLivre('a'.repeat(64),'fone bluetooth');expect(result.products).toHaveLength(1);expect(JSON.stringify(result)).not.toContain('mock-private-access');
    const [url,options]=fetcher.mock.calls[0];expect(String(url)).toBe('https://api.mercadolibre.com/sites/MLB/search?q=fone+bluetooth&limit=20&offset=0');expect(options).toMatchObject({redirect:'error',cache:'no-store',headers:{Authorization:'Bearer mock-private-access'}});
  });
  it.each([[401,'CONNECTION_MISSING'],[429,'SEARCH_RATE_LIMITED'],[500,'MELI_API_ERROR']])('erro %s preserva conexão e não repete chamadas',async(status,code)=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({access_token:'mock-should-never-be-exposed'},{status:status as number}));vi.stubGlobal('fetch',fetcher);vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    await expect(searchMercadoLivre('a'.repeat(64),'fone')).rejects.toMatchObject({code});expect(fetcher).toHaveBeenCalledTimes(1);expect(mock.token).toHaveBeenCalledTimes(1);
  });
  it('usa catálogo oficial quando a busca de anúncios é negada',async()=>{
    const fetcher=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({blocked_by:'PolicyAgent'},{status:403}))
      .mockResolvedValueOnce(Response.json({paging:{total:1},results:[{id:'MLB987654321'}]}))
      .mockResolvedValueOnce(Response.json({id:'MLB987654321',status:'active',name:'Fone catálogo',permalink:'https://www.mercadolivre.com.br/p/MLB987654321',pictures:[{url:'https://http2.mlstatic.com/D_123.jpg'}],buy_box_winner:{item_id:raw.id,price:80,currency_id:'BRL',condition:'new',shipping:{free_shipping:true}}}));
    vi.stubGlobal('fetch',fetcher);vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const result=await searchMercadoLivre('a'.repeat(64),'fone');expect(result.source).toBe('catalog');expect(result.products[0]).toMatchObject({id:raw.id,price:80,catalogId:'MLB987654321'});expect(String(fetcher.mock.calls[1][0])).toContain('/products/search?site_id=MLB&status=active');expect(String(fetcher.mock.calls[2][0])).toBe('https://api.mercadolibre.com/products/MLB987654321');
  });
  it('negação nas duas buscas retorna somente código de política, sem payload privado',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({blocked_by:'PolicyAgent',message:'mock-private-policy-detail'},{status:403}));vi.stubGlobal('fetch',fetcher);const logger=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    await expect(searchMercadoLivre('a'.repeat(64),'fone')).rejects.toMatchObject({code:'MELI_SEARCH_FORBIDDEN',resource:'catalog_search',reason:'POLICY_DENIED'});expect(fetcher).toHaveBeenCalledTimes(2);expect(JSON.stringify(logger.mock.calls)).not.toContain('mock-private-policy-detail');
  });
  it('catálogo sem oferta vencedora nunca inventa preço',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({},{status:403})).mockResolvedValueOnce(Response.json({paging:{total:1},results:[{id:'MLB987654321'}]})).mockResolvedValueOnce(Response.json({id:'MLB987654321',status:'active',name:'Sem oferta',buy_box_winner:null})).mockResolvedValueOnce(Response.json({results:[]}));vi.stubGlobal('fetch',fetcher);vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const result=await searchMercadoLivre('a'.repeat(64),'fone');expect(result.products).toEqual([]);expect(result.priceCoverage).toEqual({matches:1,active:1,winners:0,priced:0});
  });
  it('lista anúncios associados quando catálogo não informa vencedor',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({},{status:403})).mockResolvedValueOnce(Response.json({paging:{total:1},results:[{id:'MLB987654321'}]})).mockResolvedValueOnce(Response.json({id:'MLB987654321',status:'active',name:'Fone catálogo',permalink:'https://www.mercadolivre.com.br/p/MLB987654321',buy_box_winner:null})).mockResolvedValueOnce(Response.json({results:[{item_id:raw.id,price:80,currency_id:'BRL',condition:'new'}]}));vi.stubGlobal('fetch',fetcher);vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const result=await searchMercadoLivre('a'.repeat(64),'fone');expect(result.products[0]).toMatchObject({id:raw.id,price:80,catalogId:'MLB987654321'});expect(String(fetcher.mock.calls[3][0])).toBe('https://api.mercadolibre.com/products/MLB987654321/items');
  });
  it('negação de anúncios associados encerra consulta sem tentar outros IDs',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({},{status:403})).mockResolvedValueOnce(Response.json({paging:{total:2},results:[{id:'MLB987654321'},{id:'MLB123456789'}]})).mockResolvedValueOnce(Response.json({id:'MLB987654321',status:'active',name:'Fone',buy_box_winner:null})).mockResolvedValueOnce(Response.json({id:'MLB123456789',status:'active',name:'Fone',buy_box_winner:null})).mockResolvedValueOnce(Response.json({blocked_by:'PolicyAgent'},{status:403}));vi.stubGlobal('fetch',fetcher);vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    await expect(searchMercadoLivre('a'.repeat(64),'fone')).rejects.toMatchObject({code:'MELI_PRICES_FORBIDDEN',resource:'catalog_offers'});expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('query e paginação inválidas não acessam token ou rede',async()=>{expect(()=>searchQuery('a')).toThrow();expect(()=>searchQuery('a'.repeat(101))).toThrow();expect(()=>searchQuery('fone\u0000')).toThrow();await expect(searchMercadoLivre('a'.repeat(64),'fone',1)).rejects.toMatchObject({code:'SEARCH_INVALID'});expect(mock.token).not.toHaveBeenCalled();});
});
describe('score com evidência histórica',()=>{
  it('não fabrica queda histórica a partir do preço original',()=>{const result=scoreOffer(product,[],now);expect(result.sufficientHistory).toBe(false);expect(result.baselinePrice).toBeNull();expect(result.historicalDiscountPercent).toBeNull();expect(result.score).toBeLessThanOrEqual(35);expect(result.advertisedDiscountPercent).toBe(20);});
  it('usa mediana por dia para impedir peso extra de buscas repetidas',()=>{
    const entries=history([100,100,100]);entries.push(...Array.from({length:50},()=>({...entries[0],price:1000})));
    const result=scoreOffer(product,entries,now);expect(result.historyDays).toBe(3);expect(result.baselinePrice).toBe(100);expect(result.historicalDiscountPercent).toBe(20);expect(result.sufficientHistory).toBe(true);
  });
  it('buscas no mesmo dia não geram histórico suficiente',()=>{const entries=Array.from({length:10},()=>({...history([100])[0],observedAt:new Date(now.getTime()-3600_000)}));expect(scoreOffer(product,entries,now).historyDays).toBe(0);});
  it('ignora outro produto, moeda, condição, dados futuros e mais de 30 dias',()=>{
    const entry=history([100])[0];const entries=[{...entry,productId:'MLB987654321'},{...entry,currency:'USD'},{...entry,condition:'used' as const},{...entry,observedAt:new Date(now.getTime()+86400_000)},{...entry,observedAt:new Date(now.getTime()-31*86400_000)}];expect(scoreOffer(product,entries,now).historyDays).toBe(0);
  });
  it('preço acima da mediana não recebe pontos por queda',()=>{const result=scoreOffer({...product,price:200,previousPrice:undefined,shipping:undefined,condition:'used'},history([100,110,120]).map(h=>({...h,condition:'used'})),now);expect(result.historicalDiscountPercent).toBeLessThan(0);expect(result.score).toBe(0);});
});
describe('cupons não verificados e regras',()=>{
  const body={code:'teste10',kind:'percent',amount:10,minimumPurchase:50,maximumDiscount:20,expiresAt:'2026-10-20T15:00:00Z'};
  it('normaliza código e mantém valores e condições',()=>{expect(validateCoupon(body,now)).toMatchObject({code:'TESTE10',amount:10,minimumPurchase:50,maximumDiscount:20,productId:null});});
  it.each([{...body,verified:true},{...body,amount:101},{...body,amount:-1},{...body,amount:10.001},{...body,expiresAt:'2026-10-13T15:00:00Z'},{...body,productId:'invalid'},{...body,minimumPurchase:-1},{...body,startsAt:'not-a-date'}])('rejeita verificação forjada ou condições inválidas',input=>expect(()=>validateCoupon(input,now)).toThrow('COUPON_INVALID'));
  it('filtra cupom expirado, de outro produto e compra mínima',()=>{
    const coupon:Coupon={id:'unit-coupon',code:'TESTE10',kind:'percent',amount:10,minimumPurchase:50,maximumDiscount:20,productId:null,startsAt:'2026-10-13T15:00:00Z',expiresAt:'2026-10-20T15:00:00Z',verified:false,source:'manual'};
    expect(eligibleCoupons([coupon,{...coupon,id:'unit-other',productId:'MLB987654321'},{...coupon,id:'unit-min',minimumPurchase:100},{...coupon,id:'unit-old',expiresAt:now.toISOString()}],product,now)).toEqual([coupon]);expect(product.price).toBe(80);
  });
});
describe('sessão, CSRF e isolamento',()=>{
  const session='s'.repeat(43);
  const request=(headers:Record<string,string>={})=>new NextRequest('https://example.com/api/mercadolivre/search',{method:'POST',headers:{origin:'https://example.com',cookie:`__Host-croco_session=${session}`,...headers}});
  it('sem cookie ou com sessão expirada não permite busca',async()=>{await expect(requireOfferSession(request({cookie:''}),true)).rejects.toMatchObject({code:'CONNECTION_MISSING'});mock.connected.mockResolvedValue(false);await expect(requireOfferSession(request(),true)).rejects.toMatchObject({code:'CONNECTION_MISSING'});expect(mock.consume).not.toHaveBeenCalled();});
  it('origem ausente, estrangeira ou cross-site não acessa sessão/banco',async()=>{const cases:Record<string,string>[]=[{origin:''},{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'}];for(const headers of cases)await expect(requireOfferSession(request(headers),true)).rejects.toMatchObject({code:'REQUEST_FORBIDDEN'});expect(mock.connected).not.toHaveBeenCalled();});
  it('usa digest de sessão e limite por sessão/IP',async()=>{const owner=await requireOfferSession(request(),true);expect(owner).toMatch(/^[a-f0-9]{64}$/);expect(owner).not.toBe(session);expect(mock.connected).toHaveBeenCalledWith(owner);expect(mock.consume).toHaveBeenCalledTimes(2);});
  it('recusa acima do limite',async()=>{mock.consume.mockResolvedValue(false);await expect(requireOfferSession(request(),true)).rejects.toMatchObject({code:'SEARCH_RATE_LIMITED'});});
  it('limita corpo mesmo sem content-length e rejeita arrays',async()=>{
    for(const body of ['x'.repeat(5000),'[]','invalid']) {const r=new NextRequest('https://example.com/',{method:'POST',headers:{'Content-Type':'application/json'},body});await expect(readOfferBody(r)).rejects.toMatchObject({code:'REQUEST_INVALID'});}
  });
  it('preços e histórico usam owner em todas as consultas',async()=>{
    const owner='a'.repeat(64);await recordProducts(owner,[product]);expect(mock.query).toHaveBeenCalledTimes(2);for(const [sql,values] of mock.query.mock.calls){expect(sql).toContain('owner_hash');expect(values[0]).toBe(owner);}expect(mock.query.mock.calls[1][0]).toContain('DO NOTHING');
    mock.query.mockReset().mockResolvedValue({rows:[],rowCount:0});await listPriceHistories(owner,[product.id]);await productExists(owner,product.id);for(const [sql,values] of mock.query.mock.calls){expect(sql).toContain('owner_hash=$1');expect(values[0]).toBe(owner);}
  });
});
