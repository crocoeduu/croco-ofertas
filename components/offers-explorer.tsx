'use client';
import { useState, type FormEvent } from 'react';
import type { Product, AffiliateResolution } from '@/lib/offers/contracts';
import type { OfferScore } from '@/lib/offers/scoring';
import type { Coupon } from '@/lib/offers/coupons';
import type { SearchResult } from '@/lib/mercadolivre/search';
import {ProductImage} from './product-image';
import {PriceHistory} from './price-history';

type Offer = Product & { scoring: OfferScore; coupons: Coupon[]; affiliate: AffiliateResolution };
type Results = Omit<SearchResult,'products'> & { products: Offer[]; observedAt: string; administrator:boolean };
const money = (value: number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
const date = (value: string) => new Date(value).toLocaleString('pt-BR');
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url,{method:body === undefined ? 'GET' : 'POST',headers:body === undefined ? undefined : {'Content-Type':'application/json'},body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30_000)});
  const data = await response.json();
  if (!response.ok) throw new Error((typeof data.error?.message === 'string' ? data.error.message : 'Não foi possível concluir a consulta.')+(data.error?.diagnostic?.reason==='POLICY_DENIED'?' Restrição de política do Mercado Livre.':''));
  return data as T;
}
export function OffersExplorer({connected}:{connected:boolean}) {
 const [query,setQuery]=useState(''),[searched,setSearched]=useState(''),[results,setResults]=useState<Results|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [recent,setRecent]=useState<string[]>([]),[sort,setSort]=useState('opportunity'),[minimum,setMinimum]=useState(''),[maximum,setMaximum]=useState(''),[minScore,setMinScore]=useState('0'),[free,setFree]=useState(false),[condition,setCondition]=useState(''),[affiliate,setAffiliate]=useState(''),[monitored,setMonitored]=useState(false),[ready,setReady]=useState(false),[category,setCategory]=useState(''),[discount,setDiscount]=useState('0'),[watchIds,setWatchIds]=useState<string[]>([]),[readyIds,setReadyIds]=useState<string[]>([]),[actionMessage,setActionMessage]=useState(''),[compare,setCompare]=useState('');
 async function search(term:string,offset=0){if(busy)return;setBusy(true);setError('');setActionMessage('');try{const result=await api<Results&{watchIds?:string[];readyIds?:string[]}>('/api/mercadolivre/search',{query:term,offset});setResults(result);setSearched(term);setRecent(current=>[term,...current.filter(t=>t!==term)].slice(0,6));setWatchIds(result.watchIds??[]);setReadyIds(result.readyIds??[]);}catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'A consulta demorou demais. Tente novamente.');}finally{setBusy(false);}}
 async function act(action:string,id:string){if(busy)return;setBusy(true);setActionMessage('');try{await api('/api/admin/workspace',{action,product_id:id,...(action==='approve'?{channel:'site',approved:true}: {})});if(action==='watch')setWatchIds(current=>[...new Set([...current,id])]);setActionMessage(action==='watch'?'Produto monitorado. Ajuste o preço alvo em Monitoramento.':'Oferta aprovada para avaliação. Prepare a divulgação para revalidar os dados.');}catch(e){setActionMessage(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
 async function copy(product:Offer){try{await navigator.clipboard.writeText(`${product.name}\n${money(product.price)}\nAnúncio original: ${product.permalink}\nDados coletados pelo Croco; confirme no Mercado Livre.`);setActionMessage('Dados copiados para análise. Compartilhamento afiliado exige link válido.');}catch{setActionMessage('Não foi possível copiar os dados.');}}
 const products=results?.products??[];
 const visible=products.filter(p=>(!minimum||p.price>=Number(minimum))&&(!maximum||p.price<=Number(maximum))&&p.scoring.score>=Number(minScore)&&(!free||p.shipping?.free===true)&&(!condition||p.condition===condition)&&(!category||p.category===category)&&(!affiliate||(affiliate==='ready')===(p.affiliate.status==='affiliate_ready'))&&(!monitored||watchIds.includes(p.id))&&(!ready||readyIds.includes(p.id))&&(p.scoring.advertisedDiscountPercent??0)>=Number(discount));
 visible.sort((a,b)=>sort==='price_low'?a.price-b.price:sort==='price_high'?b.price-a.price:sort==='drop'?(b.scoring.historicalDiscountPercent??-Infinity)-(a.scoring.historicalDiscountPercent??-Infinity):sort==='discount'?(b.scoring.advertisedDiscountPercent??0)-(a.scoring.advertisedDiscountPercent??0):sort==='sales'?(b.soldQuantity??-1)-(a.soldQuantity??-1):b.scoring.score-a.scoring.score);
 const comparisons=products.filter(p=>p.catalogId&&p.catalogId===compare);
 return <section className="offer-section" aria-labelledby="search-title">
 <div className="section-heading"><h2 id="search-title">Encontre sua próxima oportunidade</h2><span>API oficial do Mercado Livre</span></div>
 <form className="search-form" onSubmit={e=>{e.preventDefault();void search(query.trim());}}><label htmlFor="product-search">Produto, marca ou modelo</label><div className="search-fields"><input id="product-search" value={query} onChange={e=>setQuery(e.target.value)} minLength={2} maxLength={100} placeholder="Ex.: mouse Logitech G305" required disabled={!connected}/><button disabled={!connected||busy}>{busy?'Buscando…':'Buscar produtos'}</button><button type="button" disabled={busy||!query} onClick={()=>{setQuery('');setResults(null);setError('');}}>Limpar</button></div></form>
 {recent.length>0&&<div className="recent-searches"><span>Recentes nesta sessão:</span>{recent.map(term=><button key={term} disabled={busy} onClick={()=>{setQuery(term);void search(term);}}>{term}</button>)}</div>}
 {!connected&&<div className="notice">Conecte o Mercado Livre para buscar e guardar seu histórico. <a href="/api/mercadolivre/login">Conectar Mercado Livre →</a></div>}
 <p className="offer-help">Uma observação por hora, anúncio e conta. Score provisório até três dias anteriores com coleta. Filtros e ordenação se aplicam aos produtos desta página; o catálogo pode reunir diferentes anúncios do mesmo produto.</p>
 {error&&<div className="notice" role="alert">{error}</div>}{actionMessage&&<div className="notice" role="status">{actionMessage}</div>}
 {results&&<><details><summary>Filtrar e ordenar esta página</summary><div className="filter-grid">
 <label>Preço mínimo (R$)<input type="number" min="0" step="0.01" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label><label>Preço máximo (R$)<input type="number" min="0" step="0.01" value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>
 <label>Score mínimo<input type="number" min="0" max="100" value={minScore} onChange={e=>setMinScore(e.target.value)}/></label><label>Desconto anunciado mínimo (%)<input type="number" min="0" max="100" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
 <label>Condição<select value={condition} onChange={e=>setCondition(e.target.value)}><option value="">Todas</option><option value="new">Novo</option><option value="used">Usado</option></select></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas as disponíveis</option>{[...new Set(products.map(p=>p.category).filter((v):v is string=>!!v))].map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Link afiliado<select value={affiliate} onChange={e=>setAffiliate(e.target.value)}><option value="">Todos</option><option value="ready">Pronto</option><option value="pending">Pendente</option></select></label><label>Ordenar por<select value={sort} onChange={e=>setSort(e.target.value)}><option value="opportunity">Melhor oportunidade / score</option><option value="drop">Maior queda real registrada</option><option value="discount">Maior desconto informado</option><option value="price_low">Menor preço</option><option value="price_high">Maior preço</option><option value="sales" disabled={!products.some(p=>p.soldQuantity!==undefined)}>Mais vendidos (dados disponíveis)</option></select></label>
 <label className="inline-check"><input type="checkbox" checked={free} onChange={e=>setFree(e.target.checked)}/>Frete grátis informado</label><label className="inline-check"><input type="checkbox" checked={monitored} onChange={e=>setMonitored(e.target.checked)}/>Monitorados</label><label className="inline-check"><input type="checkbox" checked={ready} onChange={e=>setReady(e.target.checked)}/>Prontos para divulgação</label></div></details>
 <p className="result-status" role="status">{visible.length} de {products.length} anúncios nesta página · “{searched}” · {date(results.observedAt)}</p></>}
 {busy&&<div className="products-grid" role="status" aria-label="Buscando produtos"><span className="skeleton"/><span className="skeleton"/><span className="skeleton"/></div>}
 {!busy&&results&&visible.length===0&&<div className="empty-state">{products.length?'Nenhum produto atende aos filtros desta página. Ajuste os critérios.':results.priceCoverage&&results.priceCoverage.matches>0?'O catálogo encontrou produtos, mas não disponibilizou anúncios com preço válido nesta página.':'Nenhum produto encontrado. Tente uma marca ou um modelo mais específico.'}</div>}
 {!busy&&<div className="products-grid">{visible.map(p=><article className="product-card" key={p.id}>
 <ProductImage src={p.imageUrl} title={p.name}/><span className="product-condition">{p.condition==='new'?'Novo':p.condition==='used'?'Usado':'Condição não informada'}</span><h3>{p.name}</h3><div className="price-line">{p.previousPrice&&<span className="previous-price" title="Preço anterior informado pelo anúncio">{money(p.previousPrice)}</span>}<strong>{money(p.price)}</strong></div>
 <span className="score-badge">Score {p.scoring.score}/100 · {p.scoring.sufficientHistory?'Com histórico':'Provisório'}</span><p className="facts">{p.scoring.historicalDiscountPercent!==null&&p.scoring.historicalDiscountPercent>0?`📉 ${p.scoring.historicalDiscountPercent}% abaixo da mediana registrada pelo Croco`:'Histórico em formação ou sem queda confirmada'}{p.shipping?.free===true&&<><br/>🚚 Anúncio informa frete grátis</>}</p>
 {p.scoring.warnings?.map(w=><p className="warning" key={w}>{w}</p>)}<p className="coupon-note">{p.affiliate.status==='affiliate_ready'?'🔗 Link afiliado pronto':'Link afiliado pendente'}</p>
 {p.affiliate.status==='affiliate_ready'&&<><a className="product-link" href={p.affiliate.clickPath} rel="sponsored">Ver oferta →</a><p className="offer-help">Publicidade · Comissão em compras elegíveis. Titularidade confirmada pelo administrador.</p></>}
 {results?.administrator&&<><a className="product-link" href={p.permalink} target="_blank" rel="noopener noreferrer">Ver anúncio original ↗</a><div className="product-actions"><button disabled={busy||watchIds.includes(p.id)} onClick={()=>void act('watch',p.id)}>{watchIds.includes(p.id)?'♥ Monitorado':'♡ Monitorar'}</button><a href={`/afiliados?product_id=${p.id}#links`}>{p.affiliate.status==='affiliate_ready'?'Editar meu link':'Adicionar meu link'}</a><button disabled={busy} onClick={()=>void act('approve',p.id)}>✓ Aprovar</button><a href={`/ofertas?product_id=${p.id}`}>Preparar divulgação</a></div></>}
 <details className="score-details"><summary>Ver detalhes e explicação do score</summary><p>{p.id}{p.catalogId?` · Catálogo ${p.catalogId}`:''}</p>{p.scoring.breakdown?.map((b,i)=><p key={i}>+{b.points} {b.label}</p>)}{!p.scoring.sufficientHistory&&<p>Limitado a 35 pontos até três dias anteriores com coleta.</p>}<ul>{p.scoring.reasons.map(r=><li key={r}>{r}</li>)}</ul>{p.soldQuantity!==undefined&&<p>Vendas informadas: {p.soldQuantity}</p>}{p.reputation&&<p>Reputação: {p.reputation}</p>}<p>Disponibilidade: {p.available===true?'informada como disponível':p.available===false?'indisponível':'a confirmar na preparação'}.</p>{p.coupons.length>0&&<p>Cupons cadastrados: {p.coupons.map(c=>`${c.code} (${c.verified?'verificado':'não verificado'})`).join(', ')}. Não alteram este preço nem o score.</p>}<button onClick={()=>void copy(p)}>Copiar dados para análise</button>{p.catalogId&&products.filter(other=>other.catalogId===p.catalogId).length>1&&<button onClick={()=>setCompare(p.catalogId!)}>Comparar anúncios do mesmo catálogo</button>}</details>
 <PriceHistory id={p.id} price={p.price} condition={p.condition}/></article>)}
 {comparisons.length>1&&<section className="surface comparison"><h2>Comparar anúncios do mesmo catálogo</h2><div className="history-scroll"><table><caption>Dados disponíveis nesta página · confirme preço e frete</caption><thead><tr><th>Anúncio</th><th>Preço</th><th>Frete grátis</th><th>Condição</th><th>Vendas</th><th>Score</th></tr></thead><tbody>{comparisons.map(p=><tr key={p.id}><td><a href={p.permalink} target="_blank" rel="noopener noreferrer">{p.name} · {p.id}</a></td><td>{money(p.price)}</td><td>{p.shipping?.free===true?'Informado':'Não confirmado'}</td><td>{p.condition==='new'?'Novo':p.condition==='used'?'Usado':'Não informada'}</td><td>{p.soldQuantity??'Não informado'}</td><td>{p.scoring.score}</td></tr>)}</tbody></table></div><button onClick={()=>setCompare('')}>Fechar comparação</button></section>}</div>}
 {results&&<nav className="pagination" aria-label="Páginas de produtos"><button disabled={busy||results.offset===0} onClick={()=>void search(searched,results.offset-20)}>Anterior</button><span>Página {results.offset/20+1}</span><button disabled={busy||results.offset+20>=results.total||results.offset>=980} onClick={()=>void search(searched,results.offset+20)}>Próxima</button></nav>}
 </section>;
}

export function CouponsPanel({connected}:{connected:boolean}) {
  const [coupons,setCoupons] = useState<Coupon[]>([]); const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  async function reload() {
    setBusy(true); setMessage('');
    try {setCoupons((await api<{coupons:Coupon[]}>('/api/offers/coupons')).coupons);}
    catch(error){setMessage(error instanceof Error?error.message:'Não foi possível carregar os cupons.');}
    finally{setBusy(false);}
  }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy)return; const form=event.currentTarget; const data=new FormData(form); setBusy(true); setMessage('');
    try {
      await api('/api/offers/coupons',{code:data.get('code'),kind:data.get('kind'),amount:Number(data.get('amount')),minimumPurchase:Number(data.get('minimumPurchase')||0),maximumDiscount:data.get('maximumDiscount')?Number(data.get('maximumDiscount')):null,productId:data.get('productId')||null,expiresAt:new Date(String(data.get('expiresAt'))).toISOString()});
      setCoupons((await api<{coupons:Coupon[]}>('/api/offers/coupons')).coupons); form.reset(); setMessage('Cupom salvo como não verificado.');
    } catch(error){setMessage(error instanceof Error?error.message:'Não foi possível salvar o cupom.');}
    finally{setBusy(false);}
  }
  return <section className="offer-section" aria-labelledby="coupon-title"><div className="section-heading"><h2 id="coupon-title">Seus cupons</h2><button onClick={()=>void reload()} disabled={!connected||busy}>Carregar cupons</button></div>
    <p className="offer-help">Cadastre cupons que você encontrou. Eles ficam associados à sua sessão e não alteram o preço nem o score até existir verificação. Restrições de conta, categoria e pagamento precisam ser confirmadas no checkout.</p>
    <form className="coupon-form" onSubmit={event=>void save(event)}><fieldset disabled={!connected||busy}><legend>Cadastrar cupom</legend>
      <label>Código<input name="code" required minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" placeholder="Código do cupom"/></label>
      <label>Desconto<select name="kind"><option value="percent">Porcentagem (%)</option><option value="fixed">Valor em reais (R$)</option></select></label>
      <label>Valor do desconto<input name="amount" type="number" min="0.01" step="0.01" required/></label>
      <label>Compra mínima (R$)<input name="minimumPurchase" type="number" min="0" step="0.01"/></label>
      <label>Teto do desconto (R$)<input name="maximumDiscount" type="number" min="0.01" step="0.01"/></label>
      <label>Anúncio específico (opcional)<input name="productId" pattern="MLB[0-9]{6,18}" placeholder="MLB123456789"/></label>
      <label>Válido até<input name="expiresAt" type="datetime-local" required/></label><button type="submit">{busy?'Aguarde…':'Salvar cupom'}</button>
    </fieldset></form>
    {message && <p role="status">{message}</p>}
    <ul className="coupon-list">{coupons.map(coupon=><li key={coupon.id}><strong>{coupon.code}</strong><span>{coupon.kind==='percent'?`${coupon.amount}%`:money(coupon.amount)} · mínimo {money(coupon.minimumPurchase)}{coupon.maximumDiscount!=null?` · teto ${money(coupon.maximumDiscount)}`:''}</span><span>Até {date(coupon.expiresAt)} · {coupon.verified?'Verificado':'Não verificado'}{coupon.productId?` · ${coupon.productId}`:''}</span></li>)}</ul>
  </section>;
}
