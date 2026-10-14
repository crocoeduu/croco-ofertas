# Afiliados · Croco Ofertas

## Fonte oficial e limites

Pesquisa de documentação em 14/10/2026: não foi encontrada API pública oficial documentada para gerar links vinculados à conta de afiliado ou verificar a titularidade de um link. OAuth da API de produtos **não** comprova adesão ao Programa de Afiliados. Não há scraping, cookies de conta, API interna ou geração de parâmetros.

Referências oficiais consultadas via índice de busca (acesso direto às páginas/termos retornou HTTP 403 neste ambiente):

- https://www.mercadolivre.com.br/l/afiliados-gere-seus-links
- https://www.mercadolivre.com.br/l/afiliados-direcionamento-de-visitas
- https://www.mercadolivre.com.br/l/boas-praticas-links
- https://www.mercadolivre.com.br/l/afiliados-compartilhamento-de-publicacao
- https://www.mercadolivre.com.br/l/afiliados-blogs-nao-proprios
- https://www.mercadolivre.com.br/l/afiliados-crie-etiquetas
- https://www.mercadolivre.com.br/knowledge-hub/30228

As orientações oficiais proíbem redirecionar visitas automaticamente, pop-ups/pop-unders e divulgação em grupos fechados/meios não declarados. Exigem identificação de publicidade. Por prudência, **GET /go/mercadolivre/[id] não redireciona nem registra clique**: mostra publicidade e um botão explícito. Apenas o POST desse botão, com intenção assinada de cinco minutos e cookie HttpOnly, registra e retorna 302. A URL afiliada cadastrada é preservada exatamente; não há abertura automática de nova aba. Mensagens usam o link oficial diretamente e, portanto, seus cliques externos não entram nas métricas Croco.

Não garantimos comissão: elegibilidade, janela de atribuição, titularidade e compras são verificadas pelo Mercado Livre. Nenhuma venda/comissão fictícia é exibida.

A página de saída usa CSP sem scripts com `form-action` restrito ao próprio site e aos domínios oficiais permitidos; assim o browser pode seguir o 302 explícito. Referrer-Policy nessa rota compartilha somente a origem Croco em navegação HTTPS externa, preservando identificação do meio de divulgação sem expor caminho, sessão ou parâmetros internos. A escolha de confirmação explícita é uma adaptação conservadora às orientações consultadas, não uma aprovação formal do Mercado Livre para este software.

## Administração e operação

- `/afiliados`: dashboard, cadastro, edição, desativação, CSV, configuração de canais e preparação de ofertas.
- Identidade: sessão opaca de OAuth existente; autorização adicional explícita pelo `ADMIN_MELI_USER_ID`, somente no servidor. Nenhuma conta recebe papel administrativo por conectar o OAuth. Não há cadastro aberto ou rota de bootstrap. O ID permitido foi definido com base na única conta já autorizada e persistida neste projeto, sem alteração de tokens/sessões.
- Todas as APIs administrativas verificam sessão ativa no banco e a identidade permitida. Escritas verificam Origin e recusam cross-site; rate limit persistido. Sem confiar no botão escondido.
- Gere seus links na Central oficial e cole-os no painel. Nesta versão é aceito somente HTTPS em domínios Mercado Livre explicitamente permitidos, caminho `/sec/` com identificador alfanumérico, sem query, fragmento, credencial ou porta. Outros formatos requerem documentação oficial antes de ampliar a validação; URLs comuns não são aceitas como afiliadas.
- `original_url` precisa identificar exatamente o `product_id` informado. Para anúncio MLB, use sua URL original de anúncio, não a página de catálogo de outro ID. Links curtos não permitem verificar o destino ou proprietário via API pública: o administrador deve confirmar que gerou o link na sua conta para aquele produto e testou seu destino.
- `verified` significa **confirmação administrativa**, nunca validação pelo Mercado Livre. Proveniência persistida: `administrator_registered`. `verified_at` e `last_checked_at` são datas dessa verificação local, não varredura de disponibilidade da página.
- URL/produto alterado exige renovar a declaração no formulário; alterações usam timestamp com precisão PostgreSQL para impedir sobrescrita concorrente. DELETE desativa, preservando analytics. Marque link quebrado `invalid` ou `disabled` manualmente; não fazemos scraping nem HEAD automatizado de link.
- CSV: cabeçalho `marketplace,product_id,original_url,affiliate_url,channel,label`, UTF-8, até 100 linhas/256 KB. Prévia assinada válida por cinco minutos; confirmação revalida duplicação. Transação única sem upsert; nenhuma sobrescrita parcial. Todos importados entram pendentes e precisam da confirmação de titularidade antes da ativação.

## Seleção automática e tracking

`AffiliateLinkService` → `MercadoLivreAffiliateProvider` → registros da conta administradora configurada. Consulta por marketplace e produto exato; somente status ativo confirmado.

1. Link específico do canal.
2. Genérico confirmado.
3. `affiliate_pending`, sem fallback para URL comum.

Se campanha foi informada, a etiqueta precisa corresponder. Sem campanha: preferir etiqueta vazia; uma única etiqueta disponível é escolhida automaticamente. Havendo várias sem padrão, ficar pendente em vez de escolher campanha arbitrária. Etiquetas são tracking interno; etiquetas oficiais devem ser escolhidas no gerador oficial antes de copiar o link. Nunca anexamos parâmetros.

O Radar mostra `Link afiliado pronto` ou `Link afiliado pendente`. O botão Ver oferta usa a rota interna ligada ao ID do link, e produtos pendentes têm esse botão desabilitado. Cadastro/edição administrativo aponta para o painel, não concede acesso por si.

Cliques: tabela somente com ID, link, produto, canal, campanha e horário. Sem IP bruto, cookie, identificador de visitante ou token. Canal de fallback genérico pode ser identificado por `?channel=site`/canal permitido, vinculado à intenção assinada; jamais se aceita parâmetro `url`. Intenção só pode ser usada uma vez. Rate limit usa hash temporário de IP confiável da Vercel na tabela existente; não em analytics. Contagens são cliques confirmados, não pessoas únicas; sem promessa de filtrar todos os robôs.

## Preparação e futuro transporte

Estados: `candidate`, `approved`, `affiliate_pending`, `ready_to_send`, `sent`, `disabled`. Preparar exige conta administradora e consulta oficial `/items/{id}` com preço real BRL, status ativo e quantidade disponível positiva; se o recurso for negado/não trouxer dados, nada é liberado. Atualiza histórico e recalcula score. Cupons manuais continuam não verificados e não alteram preço/score/mensagem.

`ready_to_send`: aprovação, score mínimo, preço consultado há no máximo cinco minutos, estoque confirmado, canal público declarado habilitado, link confirmado e deduplicação. Default: score 60, intervalo 24h, queda 5%, aumento de score 10; piso absoluto de uma hora entre envios. Cupom só justificará reenvio quando houver futuro adaptador de verificação oficial. Score não depende da existência do link.

`MessageComposer`: produto, preço e informação de anúncio confirmados; histórico real somente quando suficiente; aviso de publicidade e confirmação de condições. Mensagem usa URL afiliada original, não encurtador de terceiros. Mensagens salvas não são devolvidas em listagens: precisam ser preparadas novamente para obter texto atual. Listagem retira estado pronto se preço expirou, canal foi desativado ou link tornou-se inválido.

Tabelas de preparação e histórico constituem a base da futura fila. **Nenhum transportador ou envio está implementado**. O futuro adaptador oficial deve reexecutar preparação imediatamente antes do envio, compartilhar o lock por conta/produto/canal, garantir idempotência e só registrar `sent`/histórico após recibo oficial. Campos Shopee existem na arquitetura; o provider permanece desabilitado até documentação oficial própria.

## Banco e segurança

Migration: `supabase/migrations/20261014225957_affiliate_links_distribution.sql`. Tabelas no schema privado `offers`: `affiliate_links`, `affiliate_clicks`, `affiliate_channels`, `distribution_offers`, `distribution_history`. RLS habilitado e acesso revogado de PUBLIC/anon/authenticated; backend Node pg usa conexão TLS atual e parâmetros SQL. Não existem credenciais Mercado Livre nessas tabelas; dados de afiliados separados de tokens. Data API continua desativado.

OAuth/PKCE/state/criptografia/refresh/session/TLS não foram alterados. `.env.example` contém só nomes vazios; novo ID de administrador não é publicado no client.

## Validação

Testes de links, ausência, produto errado, domínios, canais/fallback, status, CSV, conflitos, registro de clique, intenção/CSRF/open redirect, deduplicação, preparação e composição estão no Vitest. Rodar npm ci, lint, typecheck, test, security:check, build, test:smoke e audit high.

O proprietário optou por cadastrar seu link real posteriormente. Enquanto nenhum link real foi fornecido/cadastrado, a validação do clique com atribuição real permanece pendente; não inserimos exemplos, links de terceiros ou URL afiliada inventada em produção.
