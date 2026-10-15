import {test,expect} from '@playwright/test';
const id='MLB123456789';
const product={provider:'mercadolivre',id,name:'Mouse de teste para validação da interface',price:80,previousPrice:100,currency:'BRL',condition:'new',available:true,permalink:'https://produto.mercadolivre.com.br/MLB-123456789-mouse',imageUrl:'https://http2.mlstatic.com/test.jpg',scoring:{score:25,sufficientHistory:false,historyDays:0,historicalDiscountPercent:null,advertisedDiscountPercent:20,reasons:['Histórico em formação'],breakdown:[{label:'Desconto informado',points:20}],warnings:[],version:'v2'},coupons:[],affiliate:{status:'affiliate_pending'}};
const analytics={counts:{pending:0},clicks:0,products:[],channels:[],campaigns:[],daily:[]};
test.beforeEach(async({page})=>{
 await page.route('https://http2.mlstatic.com/**',route=>route.abort());
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  let data:unknown={saved:true};
  if(url.pathname==='/api/mercadolivre/search')data={products:[product],total:1,offset:0,limit:20,administrator:true,observedAt:new Date().toISOString(),watchIds:[],readyIds:[]};
  else if(url.pathname.endsWith('/history'))data={history:[{price:100,observedAt:'2026-10-10T12:00:00Z',condition:'new'},{price:80,observedAt:'2026-10-15T12:00:00Z',condition:'new'}]};
  else if(url.pathname==='/api/admin/affiliates'&&route.request().method()==='GET')data={links:[],dashboard:analytics};
  else if(url.pathname==='/api/admin/workspace'&&body.action==='simulate')data={dryRun:true,externalSent:false,message:'Mensagem de teste · Publicidade',notice:'Esta mensagem seria enviada. Simulação concluída; nenhum envio externo ocorreu.'};
  else if(url.pathname==='/api/admin/workspace'&&body.action==='prepare')data={state:'affiliate_pending',reasons:['Link afiliado pendente'],message:null};
  else if(url.pathname==='/api/admin/workspace'&&route.request().method()==='GET')data={products:[],watchlist:[],notifications:[],analytics,offers:[],settings:{paused:true,dryRun:true},campaigns:[]};
  await route.fulfill({json:data});
 });
});
test('Radar: Enter, imagem indisponível, filtros, histórico e produto analisável sem afiliado',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/radar');await page.getByLabel('Produto, marca ou modelo').fill('mouse');await page.getByLabel('Produto, marca ou modelo').press('Enter');
 await expect(page.getByRole('heading',{name:product.name})).toBeVisible();await expect(page.getByText('Imagem indisponível')).toBeVisible();await expect(page.getByText('Link afiliado pendente',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Ver anúncio original'})).toHaveAttribute('href',product.permalink);await expect(page.getByRole('link',{name:'Ver oferta →'})).toHaveCount(0);
 await page.getByText('Filtrar e ordenar esta página').click();await page.getByLabel('Preço máximo (R$)').fill('50');await expect(page.getByText('Nenhum produto atende aos filtros desta página. Ajuste os critérios.')).toBeVisible();await page.getByLabel('Preço máximo (R$)').fill('');
 await page.getByText('📊 Histórico de preços').click();await expect(page.getByRole('img',{name:/Preços registrados pelo Croco/})).toBeVisible();await expect(page.getByText(/Menor preço registrado pelo Croco nos últimos 30 dias/)).toBeVisible();
 const request=page.waitForRequest(r=>r.url().endsWith('/api/admin/workspace')&&r.postDataJSON().action==='watch');await page.getByRole('button',{name:'♡ Monitorar'}).click();expect((await request).postDataJSON()).toMatchObject({action:'watch',product_id:id});await expect(page.getByRole('button',{name:'♥ Monitorado'})).toBeVisible();
 expect(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0&&!e.closest('.history-scroll')).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,80),width:e.getBoundingClientRect().width})).slice(0,6))).toEqual([]);expect(errors).toEqual([]);
});
test('cadastro a partir do produto preenche identificador e anúncio, sem fingir atribuição oficial',async({page})=>{
 await page.goto('/afiliados?product_id='+id);await expect(page.getByLabel('Código do produto')).toHaveValue(id);await expect(page.getByLabel('Anúncio original')).toHaveValue(product.permalink);await page.getByLabel('Minha URL afiliada oficial').fill('https://mercadolivre.com/sec/Example1');
 const request=page.waitForRequest(r=>r.url().endsWith('/api/admin/affiliates')&&r.method()==='POST');await page.getByRole('button',{name:'Cadastrar link',exact:true}).click();expect((await request).postDataJSON()).toMatchObject({product_id:id,status:'pending',own_link_confirmed:false});await expect(page.getByText(/O Mercado Livre não verificou a titularidade via API/i)).toBeVisible();expect(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0&&!e.closest('.history-scroll')).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,80),width:e.getBoundingClientRect().width})).slice(0,6))).toEqual([]);
});
test('aprovada sem afiliado continua pendente e não gera mensagem de envio',async({page})=>{
 await page.goto('/ofertas?product_id='+id);await page.getByLabel(/Aprovo esta oferta/).check();await page.getByRole('button',{name:'Revalidar e preparar'}).click();await expect(page.getByRole('status')).toContainText('Afiliado pendente');await expect(page.getByRole('button',{name:'Copiar mensagem + link'})).toHaveCount(0);expect(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0&&!e.closest('.history-scroll')).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,80),width:e.getBoundingClientRect().width})).slice(0,6))).toEqual([]);
});
for(const path of ['/dashboard','/monitoramento','/distribuicao','/configuracoes','/cupons'])test(`layout sem overflow e navegação acessível em ${path}`,async({page})=>{
 await page.goto(path);await expect(page.getByRole('navigation',{name:'Navegação principal'})).toBeVisible();expect(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0&&!e.closest('.history-scroll')).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,80),width:e.getBoundingClientRect().width})).slice(0,6))).toEqual([]);await expect(page.getByRole('heading',{name:'Ambiente de testes'})).toBeVisible();
 if(path==='/distribuicao')await expect(page.getByText('DRY RUN ativo · nenhum envio externo')).toBeVisible();
});

test('fila solicita revalidação e mostra confirmação explícita de dry run',async({page})=>{
 await page.goto('/distribuicao?ready=1');const request=page.waitForRequest(r=>r.url().endsWith('/api/admin/workspace')&&r.postDataJSON().action==='simulate');await page.getByRole('button',{name:'Revalidar e simular envio'}).click();expect((await request).postDataJSON().id).toBe('12345678-1234-4123-8123-123456789012');await expect(page.getByRole('status')).toContainText('nenhum envio externo ocorreu');
});
