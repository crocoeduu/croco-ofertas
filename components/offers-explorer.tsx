'use client';
import { useState, type FormEvent } from 'react';
import type { Product } from '@/lib/offers/contracts';
import type { OfferScore } from '@/lib/offers/scoring';
import type { Coupon } from '@/lib/offers/coupons';
import type { SearchResult } from '@/lib/mercadolivre/search';

type Offer = Product & { scoring: OfferScore; coupons: Coupon[] };
type Results = Omit<SearchResult,'products'> & { products: Offer[]; observedAt: string };
type History = { price: number; currency: string; observedAt: string; condition?: string }[];
const money = (value: number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
const date = (value: string) => new Date(value).toLocaleString('pt-BR');
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url,{method:body === undefined ? 'GET' : 'POST',headers:body === undefined ? undefined : {'Content-Type':'application/json'},body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30_000)});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error?.message === 'string' ? data.error.message : 'Não foi possível concluir a consulta.');
  return data as T;
}
export function OffersExplorer({connected}:{connected:boolean}) {
  const [query,setQuery] = useState(''); const [searched,setSearched] = useState('');
  const [results,setResults] = useState<Results|null>(null); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const [histories,setHistories] = useState<Record<string,History>>({}); const [historyErrors,setHistoryErrors] = useState<Record<string,string>>({});
  async function search(term: string,offset = 0) {
    if (busy) return; setBusy(true); setError('');
    try { const result = await api<Results>('/api/mercadolivre/search',{query:term,offset}); setResults(result); setSearched(term); }
    catch (error) { setError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'A consulta demorou demais. Tente novamente.'); }
    finally { setBusy(false); }
  }
  async function loadHistory(id:string) {
    if (histories[id]) return;
    try { const result = await api<{history:History}>(`/api/mercadolivre/products/${id}/history`); setHistories(current => ({...current,[id]:result.history})); setHistoryErrors(current => ({...current,[id]:''})); }
    catch { setHistoryErrors(current => ({...current,[id]:'Não foi possível carregar o histórico agora.'})); }
  }
  const submit = (event:FormEvent<HTMLFormElement>) => {event.preventDefault(); void search(query.trim());};
  return <section className="offer-section" aria-labelledby="search-title">
    <div className="section-heading"><h2 id="search-title">Buscar produtos no Mercado Livre</h2><span>Dados coletados na API oficial</span></div>
    <form className="search-form" onSubmit={submit}><label htmlFor="product-search">Produto, marca ou modelo</label><div className="search-fields"><input id="product-search" value={query} onChange={event=>setQuery(event.target.value)} minLength={2} maxLength={100} placeholder="Ex.: fone bluetooth" required disabled={!connected}/><button type="submit" disabled={!connected||busy}>{busy?'Buscando…':'Buscar produtos'}</button></div></form>
    {!connected && <div className="notice">Conecte o Mercado Livre para buscar produtos e guardar o histórico. <a href="/api/mercadolivre/login">Conectar Mercado Livre →</a></div>}
    <p className="offer-help">O histórico começa na primeira consulta, com no máximo uma coleta por hora para cada anúncio. O score exige três dias anteriores com dados para avaliar queda de preço. Preço e frete devem ser confirmados no Mercado Livre.</p>
    {error && <div className="notice" role="alert">{error}</div>}
    <div aria-live="polite" aria-atomic="true">{results && <p className="results-note">{results.products.length} produtos nesta página · busca por “{searched}” · coleta em {date(results.observedAt)}</p>}</div>
    {results?.products.length === 0 && <p>Nenhum produto disponível nesta busca.</p>}
    <div className="products-grid">{results?.products.map(product=><article className="product-card" key={product.id}>
      <div className="product-image">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" width="160" height="160" referrerPolicy="no-referrer"/> : <span>Sem imagem</span>}</div>
      <span className="product-condition">{product.condition==='new'?'Novo':product.condition==='used'?'Usado':'Condição não informada'} · {product.id}</span>
      <h3>{product.name}</h3><div className="price-line">{product.previousPrice && <span className="previous-price">{money(product.previousPrice)}</span>}<strong>{money(product.price)}</strong></div>
      <span className="score-badge">Score {product.scoring.score}/100 · {product.scoring.sufficientHistory?'Com histórico':'Provisório'}</span>
      <ul className="score-reasons">{product.scoring.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
      {product.coupons.length>0 && <p className="coupon-note">Cupons cadastrados: {product.coupons.map(c=>`${c.code} (${c.verified?'verificado':'não verificado'})`).join(', ')}. Condições e aplicação precisam ser confirmadas.</p>}
      <a className="product-link" href={product.permalink} target="_blank" rel="noopener noreferrer">Ver no Mercado Livre ↗</a>
      <details onToggle={event=>{if(event.currentTarget.open)void loadHistory(product.id);}}><summary>Histórico de preços · 30 dias</summary>
        {historyErrors[product.id]?<p role="alert">{historyErrors[product.id]}</p>:!histories[product.id]?<p>Carregando…</p>:<div className="history-scroll"><table><caption>Preços observados deste anúncio</caption><thead><tr><th>Data</th><th>Preço</th></tr></thead><tbody>{histories[product.id].map(entry=><tr key={entry.observedAt}><td>{date(entry.observedAt)}</td><td>{money(entry.price)}</td></tr>)}</tbody></table></div>}
      </details>
    </article>)}</div>
    {results && results.products.length>0 && <nav className="pagination" aria-label="Páginas de produtos"><button disabled={busy||results.offset===0} onClick={()=>void search(searched,results.offset-20)}>Anterior</button><span>Página {results.offset/20+1}</span><button disabled={busy||results.offset+20>=results.total||results.offset>=980} onClick={()=>void search(searched,results.offset+20)}>Próxima</button></nav>}
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
