# Croco Ofertas

Site publicado: [croco-ofertas.vercel.app](https://croco-ofertas.vercel.app). [Radar de Ofertas](https://croco-ofertas.vercel.app/radar). [Health check](https://croco-ofertas.vercel.app/api/health). Callback de produção: `https://croco-ofertas.vercel.app/api/mercadolivre/callback`. OAuth e persistência criptografada estão configurados. Veja [OPERACAO.md](OPERACAO.md) para a versão operacional atual; `VALIDACAO.md` registra os testes da etapa anterior.

Central de ofertas em Next.js 16 (App Router), React 19, TypeScript, Node.js 24 e npm: OAuth Authorization Code com PKCE S256, persistência AES-GCM, busca backend de anúncios, histórico próprio, scoring explicável e cadastro de cupons não verificados. Afiliados e envio ao WhatsApp são etapas seguintes; links atuais não geram comissão.

## Instalação e execução

```sh
npm install
cp .env.example .env.local
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env.local`. Abra o endereço local impresso pelo Next.js. Configure somente no arquivo ignorado `.env.local`, nunca nos arquivos versionados. Desenvolvimento pode usar `http://localhost:3000/api/mercadolivre/callback`; o Mercado Livre pode exigir HTTPS até para desenvolvimento, conforme a configuração da aplicação. Prefira validar a conexão no domínio de produção.

```sh
npm run lint
npm run typecheck
npm test
npm run security:check
npm run build
npm audit
npm run check
npm run test:smoke
```

`check` executa lint, TypeScript, testes, scanner e build. `npm start` serve o build de produção. Os testes usam mocks, sem autorizações ou chamadas reais ao Mercado Livre. Instalação reproduzível: `npm ci`, usando `package-lock.json`.

`test:smoke` deve ser executado após o build: inicia temporariamente um servidor de produção em localhost:3217, injeta somente sentinelas aleatórias de teste e verifica HTML, JS público, headers, cookies e rotas. Não segue o redirect para o provedor e não usa credenciais reais.

O lint usa ESLint oficial, typescript-eslint e regras recomendadas de React Hooks. O preset eslint-config-next foi substituído porque sua dependência transitiva `braces` apresenta [vulnerabilidade alta sem versão corrigida](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Essa substituição mantém lint e proibição de `any`; TypeScript e o build do Next continuam obrigatórios. Não foi feita supressão do audit nem downgrade do framework.

## Aplicação no Mercado Livre

1. Crie a aplicação na [área de desenvolvedores](https://developers.mercadolivre.com.br/).
2. Habilite Authorization Code e PKCE na configuração da aplicação. Use os escopos mínimos necessários e confirme a disponibilidade de cada recurso antes de adicionar funcionalidades.
3. Guarde o App ID como `MELI_CLIENT_ID` e a Secret Key como `MELI_CLIENT_SECRET`, somente no ambiente do servidor.
4. Primeiro publique o site. Verifique o domínio estável real que a Vercel atribuiu e abra `/api/health` nesse domínio.
5. Cadastre `https://DOMINIO-REAL/api/mercadolivre/callback` como Redirect URI no Mercado Livre, sem barra final, query ou fragmento.
6. Configure exatamente esse mesmo valor em `MELI_REDIRECT_URI` na Vercel e faça novo deploy.
7. Abra a Central de Ofertas e clique em **CONECTAR MERCADO LIVRE**. A autenticação e o consentimento são feitos diretamente no Mercado Livre.

Referência: [Autenticação e autorização oficial](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao). Este projeto utiliza os hosts oficiais definidos no código. O frontend não recebe tokens nem dados privados da conta.

## Vercel e GitHub

O nome desejado é `croco-ofertas`, mas `croco-ofertas.vercel.app` não é presumido nem garantido. Confirme o domínio em **Project → Settings → Domains** após o deploy. Não use uma URL transitória de Preview como callback principal.

Crie um repositório chamado `croco-ofertas`, mantenha `main` como branch de produção e importe-o na Vercel como **Next.js**, com Node.js **24.x** e a raiz do projeto como Root Directory. Comandos padrão: `npm ci` e `npm run build`. Não há `vercel.json`: o adaptador padrão do Next.js atende às rotas serverless.

Em **Project → Settings → Environment Variables**, configure para Production:

| Variável | Necessidade |
| --- | --- |
| `MELI_CLIENT_ID` | Obrigatória para iniciar OAuth |
| `MELI_CLIENT_SECRET` | Obrigatória para iniciar OAuth; segredo server-side |
| `MELI_REDIRECT_URI` | Obrigatória; callback HTTPS exata do domínio estável real |
| `DATABASE_URL` | Obrigatória para persistência e Radar; PostgreSQL com TLS verificado |
| `TOKEN_ENCRYPTION_KEY` | Obrigatória quando há banco; 32 bytes em hexadecimal (64 caracteres) |

As duas últimas ficam **ausentes** quando não há banco; não cadastre placeholders como valores de produção. Uma configuração parcial ou inválida de banco falha de forma segura. Gere a chave com um gerenciador de segredos ou `crypto.randomBytes(32)` em ambiente privado; não cole a chave no chat, em logs ou no Git. A chave de criptografia deve permanecer estável para permitir a leitura dos tokens existentes. Rotação exige migração controlada dos registros, não apenas troca da variável.

Em Preview, deixe credenciais OAuth e banco de produção ausentes. Isso mantém a interface e health acessíveis, e o login retorna 503 amigável. O CI não precisa de credenciais. Produção sem credenciais tem o mesmo comportamento deliberado; não é conexão concluída.

Após configurar variáveis, faça novo deploy. Verifique publicamente:

- `/`: interface responsiva;
- `/api/health`: HTTP 200 e exatamente `{"status":"ok"}`;
- `/api/mercadolivre/login`: HTTP 302 para `https://auth.mercadolivre.com.br/authorization` quando configurado, ou 503 amigável se faltam variáveis;
- `/api/mercadolivre/callback`: sem parâmetros retorna HTTP 400 com mensagem segura.

`MELI_REDIRECT_URI` é lida exclusivamente do ambiente, tanto na autorização quanto na troca do código. Não é construída de headers ou da URL da requisição. Os únicos redirects de sucesso vão à raiz do domínio configurado. Querys arbitrárias de redirect são rejeitadas.

O workflow `.github/workflows/ci.yml` executa em push e pull_request: instalação, lint, typecheck, testes, scanner, build e audit de vulnerabilidades altas. Ative proteção da branch `main`, exigindo o job **check** antes do merge; configure Deployment Checks na Vercel se quiser também bloquear promoção até o CI passar. O workflow não faz merge automaticamente. Dependabot já está configurado. Ative **secret scanning** e **push protection** no GitHub quando disponíveis.

## OAuth, sessões e privacidade

State: 32 bytes aleatórios, comparado em tempo constante após validar tamanho e formato. PKCE: verifier de 48 bytes e challenge SHA-256/S256. Os cookies temporários expiram em dez minutos, têm HttpOnly, Secure, SameSite=Lax, Path=/ e nenhum Domain. HTTPS usa `__Host-meli_state` e `__Host-meli_pkce`; localhost HTTP usa nomes sem prefixo. Todas as tentativas de callback limpam state e verifier.

Campos duplicados, caracteres inválidos, parâmetros inesperados e entradas excessivas são rejeitados. `error_description` nunca é exibido ou logado. `access_denied` recebe mensagem amigável e HTTP 403. Falta de state, verifier ou code nunca faz uma chamada de token. O código só é trocado uma vez, com timeout de dez segundos, sem retry automático e sem seguir redirects externos.

Com banco, cada conexão pertence à **sessão do navegador que concluiu OAuth**, não a uma conta global do site. O navegador recebe apenas um identificador aleatório opaco; no banco, sua chave é um hash SHA-256. Nenhum cookie contém access/refresh token. O status **Conectado** só é mostrado após verificar a sessão no banco; não é derivado de uma query string. Não existem endpoints públicos de conta, tokens ou administração. Este identificador é uma credencial de sessão: preserve HTTPS e HttpOnly. A sessão expira em 30 dias e não é uma identidade administrativa; futuras rotas admin exigem autenticação de usuário, autorização e proteção contra CSRF próprias.

Sem banco, o callback recebe tokens apenas para concluir o protocolo e os descarta. Redireciona com um marcador informativo e mostra **“Mercado Livre autorizado com sucesso. Armazenamento persistente ainda não configurado.”** O status continua **Não conectado**. Esse marcador pode ser digitado manualmente e não é prova de autorização, nem concede acesso.

Refresh da callback após limpeza retorna erro seguro. Com PostgreSQL, o hash do state também é consumido atomicamente antes da troca, impedindo chamadas concorrentes com o mesmo state. Sem persistência, cookies e o código single-use do provedor são as proteções disponíveis; requisições simultâneas com cookies ainda válidos não têm trava distribuída. Nenhuma falha causa retry automático.

## PostgreSQL e criptografia

Use conexão compatível com serverless (preferencialmente endpoint com pool do provedor). Configure `DATABASE_URL` com `sslmode=verify-full`; certificados são verificados e não há opção que desative a verificação. O backend e os scripts privados removem os parâmetros SSL da URL antes de passá-la ao pg e configuram TLS explicitamente, com validação de certificado e hostname. O conjunto de confiança inclui as CAs públicas do Node e a CA oficial Supabase Root 2021; nunca se desabilita a validação. Configure a chave AES e execute, a partir de ambiente privado:

```sh
npm run db:migrate
```

O script lê `.env.local` sem imprimir a URL. Aplica `db/001_initial.sql` e as migrações aditivas e idempotentes em `supabase/migrations`, em ordem. Não é executado durante o build. Restrinja o usuário de banco ao esquema/tabelas necessários; não use credenciais administrativas da conta de hospedagem na aplicação. Use `db/cleanup.sql` em um agendador do banco para remover buckets e states expirados e sessões encerradas.

`saveMercadoLivreTokens`, `getMercadoLivreTokens` e `updateMercadoLivreTokens` formam a abstração de armazenamento. **Access e refresh tokens** são criptografados com AES-256-GCM da biblioteca nativa Node, IV aleatório de 12 bytes e tag autenticadora de 16 bytes. O contexto autenticado vincula cada ciphertext à sessão e ao tipo de token, impedindo troca de registros entre sessões. A chave nunca é armazenada junto ao ciphertext. Não há arquivos locais de tokens, SQLite ou fallback inseguro.

`refreshMercadoLivreToken` faz POST backend ao endpoint oficial. `getValidAccessToken` adquire trava PostgreSQL `FOR UPDATE`, revalida a expiração e persiste os dois novos tokens na mesma transação. Isso serializa refresh concorrente por sessão. Se a rotação remota ocorrer e a persistência falhar, a conexão pode exigir nova autorização; não se tenta recuperar usando o refresh antigo. O cliente `/users/me` existe somente no backend e não tem rota pública.

## Rate limiting e headers

Com banco, `RateLimitBackend` tem implementação persistente PostgreSQL, com incremento atômico: 10 logins/minuto e 30 callbacks/minuto por IP informado pelo header sobrescrito pela Vercel. Fora da Vercel, usa chave local compartilhada, sem confiar em headers enviados pelo visitante. Tokens de state consumidos também são persistentes.

Sem banco, existe somente cooldown de login de cinco segundos, em cookie assinado. **Apagar cookies contorna essa proteção. Não é um rate limit distribuído e callbacks não têm limite persistente nesse modo.** Antes de uso com tráfego real, configure o PostgreSQL ou implemente Redis/Upstash em `RateLimitBackend`, além das regras de firewall apropriadas. Nenhum Map global simula proteção serverless.

Rotas OAuth têm `Cache-Control: no-store`, Referrer-Policy `no-referrer` e noindex. Páginas têm CSP com nonce novo por requisição e `strict-dynamic`, sem `unsafe-inline` para scripts, renderização dinâmica compatível com Next.js, frame-ancestors bloqueado, nosniff, DENY, Permissions-Policy e HSTS em produção. Não há CORS global ou wildcard. O nonce é propagado pela `proxy.ts`; o middleware segue a nomenclatura atual do Next.js. Não exponha URLs da callback contendo code/state em ferramentas de analytics; não adicione logging de querys. O projeto não loga respostas OAuth, cookies, ambiente ou tokens. Logs de acesso da própria hospedagem são administrados na plataforma.

## Nunca faça commit das credenciais

Somente exemplos de placeholders:

```dotenv
MELI_CLIENT_ID=SEU_CLIENT_ID
MELI_CLIENT_SECRET=SEU_CLIENT_SECRET
```

O `.env.example` versionado tem apenas valores vazios. `.gitignore` exclui todos os demais `.env*`, `.next`, `.vercel`, dependências, logs e chaves. Nenhum segredo deve usar o prefixo `NEXT_PUBLIC_`. Módulos de ambiente, OAuth, banco, criptografia e tokens importam `server-only`; uma importação por Client Component falha no build.

O repositório local inclui hook de pre-commit. Após clonar, ative-o com `git config core.hooksPath .githooks` para executar o scanner antes de commits. Hooks podem ser contornados; o CI e push protection continuam necessários.

`security:check` é um scanner local sem serviços externos. Examina arquivos rastreados e candidatos a commit, rejeita `.env` rastreado, valores no exemplo, padrões reais de tokens Mercado Livre/GitHub/AWS, chaves privadas, senha em URI de banco, segredos literais e exposição pública de variáveis. Também busca valores de segredos presentes no ambiente dentro do bundle público já compilado, sem imprimir esses valores. Testes verificam que o scanner detecta vazamentos. Ele é uma barreira básica, **não detecta todo segredo possível nem substitui secret scanning/push protection**. Execute novamente depois do build e antes de push.

### Se um segredo vazar

1. Revogue/rotacione o Client Secret no Mercado Livre imediatamente.
2. Atualize a variável protegida na Vercel.
3. Faça novo deploy.
4. Remova o segredo do histórico Git quando necessário e verifique forks/artefatos, seguindo o procedimento de incidente do repositório.
5. Apagar apenas o arquivo ou criar um commit de remoção não invalida um segredo exposto.

Access/refresh tokens vazados são comprometidos: revogue a autorização/rotacione e autorize novamente. Se a chave AES ou senha de banco vazar, investigue acesso aos registros, revogue tokens afetados e faça rotação/migração controlada das credenciais.

## Erros comuns

| Situação | Comportamento / correção |
| --- | --- |
| Variáveis OAuth ausentes | 503 amigável; configure as três variáveis e faça redeploy |
| Callback HTTP, query, barra final ou URI diferente | Configuração rejeitada; use exatamente a URI registrada |
| State errado, ausente ou cookie expirado | 400; inicie a conexão novamente no mesmo navegador |
| Verifier ausente | 400; inicie novamente |
| Consentimento cancelado | 403; tente novamente quando desejar |
| Resposta do provedor inválida ou credenciais rejeitadas | 502 sem payload remoto; confira a configuração na área do desenvolvedor |
| Muitas tentativas | 429, Retry-After; aguarde um minuto |
| Banco indisponível, sem migração ou chave inválida | Falha segura; corrija banco/chave/migração; tokens não são gravados em fallback |
| Conta colaboradora ou validação pendente | Confirme as restrições na documentação oficial e use a conta apropriada |

Os códigos internos incluem ENV_MISSING, ENV_INVALID, INVALID_STATE, PKCE_MISSING, CODE_MISSING, ACCESS_DENIED, TOKEN_ENDPOINT_ERROR, RATE_LIMITED, NETWORK_ERROR e STORAGE_ERROR. A mensagem pública é selecionada por uma lista fixa; valores do visitante, stack traces e erros do banco não são interpolados.

## Expansão futura

### Radar de Ofertas

`/radar` usa a sessão opaca já criada pelo OAuth, sem alterar o callback, os cookies ou a chave AES. Rotas:

- `POST /api/mercadolivre/search`: JSON `{ "query": "fone bluetooth", "offset": 0 }`. Origem exata obrigatória, sessão válida e limites persistentes por sessão/IP. Busca 20 anúncios por página no site MLB, somente BRL. Tokens não entram no JSON público.
- `GET /api/mercadolivre/products/MLB123456789/history`: `?days=7|30|90`, limitado aos produtos da mesma conta autenticada.
- `GET /api/offers/coupons` e `POST /api/offers/coupons`: cupons da sessão. Cadastro manual contém código, tipo/valor, compra mínima, teto, anúncio opcional e datas. O cliente não pode marcar como verificado.

A migração `supabase/migrations/20261014212846_offers_products_history_coupons.sql` cria o schema privado `offers`, com `products`, `price_observations` e `coupons`. RLS está ativo sem políticas públicas; `anon`/`authenticated` não têm acesso. O Data API permanece desligado. O backend `pg` aplica ownership em todas as consultas. Não há migração automática em login/callback nem no build.

Preços ficam em centavos inteiros. Produto e observação são salvos em uma transação, com no máximo uma observação por hora/anúncio/conta, com locks entre sessões. O score v2 compara a mediana de cada dia e depois a mediana dos dias, exigindo três dias anteriores com dados comparáveis (mesmo anúncio, moeda e condição), nos últimos 30 dias. O dia atual não compõe a referência. O score provisório fica limitado a 35/100; desconto anunciado é identificado como informação do anúncio. Cupom manual não altera preço ou score.

O histórico das sessões da mesma conta do Mercado Livre é consultado em conjunto. Dados antigos são preservados. A coleta ocorre nas buscas e pela watchlist; o agendador está preparado, mas depende de CRON_SECRET e configuração autorizada. Nunca apague conexões para resolver falhas de interface: há dados vinculados por FK. Preço pode variar por opção, conta, quantidade, pagamento e CEP; confirme no checkout.

Um 403 da API de busca retorna `MELI_SEARCH_FORBIDDEN` e preserva OAuth/persistência. Não indica senha de banco incorreta. Acesso à busca precisa ser validado com a aplicação e conta reais; não é garantido pelo sucesso do OAuth.

Após a primeira negação da busca de anúncios, há uma consulta ao catálogo documentado em `providers/mercadolivre/README.md`. São usados preços reais em BRL do anúncio vencedor (`buy_box_winner`), quando disponível, ou dos anúncios associados. Um 404 individual é ignorado; acesso negado a um recurso de preços encerra a consulta. O link de catálogo vem da API ou é construído no domínio oficial a partir de um product ID validado. A consulta tem deadline de 20 segundos e detalhes do catálogo são carregados em lotes de quatro, sem retries ou mudanças de permissão.

### Operação, afiliados e distribuição

A versão atual separa `/dashboard`, `/radar`, `/monitoramento`, `/afiliados`, `/ofertas`, `/cupons`, `/distribuicao` e `/configuracoes`. Administração exige sessão ativa e `ADMIN_MELI_USER_ID` autorizado no servidor. Dashboard e páginas operacionais usam noindex; isso complementa a autorização, sem substituí-la.

As migrations `20261015123227_radar_monitoring_queue.sql` e `20261015130223_watch_evidence.sql` adicionam monitoramento, alertas, configurações, campanhas, jobs, auditoria e fila sem apagar dados. A fila só simula; nenhum transporte de WhatsApp ou Shopee está configurado. Aprovação continua manual, com revalidação oficial e deduplicação antes de compor/simular.

Links completos de produto podem ser guardados como pendentes e preservados integralmente. A ativação continua restrita ao formato oficial suportado com confirmação administrativa; não há API pública encontrada para comprovar titularidade. [OPERACAO.md](OPERACAO.md) detalha o caso MLB4609951889, limitações oficiais, parâmetros de segurança, custos, retenção e rollback.

`lib/offers/contracts.ts` separa MercadoLivreSearchService, PriceHistoryService, OfferScoringService, AffiliateLinkService, AffiliateLinkProvider, CouponService e DistributionProvider. `providers/mercadolivre` e `providers/shopee` registram os limites da etapa atual.

Campos como quantidade vendida, preço anterior, reputação e frete são opcionais, pois dependem de permissões e do que a API realmente oferece. Descontos devem ser confrontados com histórico próprio de observações; não considere um “OFF” informado pelo anúncio como comprovação. Busca de produtos e geração de links afiliados são funções distintas. Novas integrações serão oficiais, sem inventar APIs de Shopee/afiliados ou automatizar WhatsApp Web. APIs administrativas exigem autenticação, autorização server-side e controles CSRF; robots/noindex não são segurança.

Diagnóstico privado (com variáveis injetadas no ambiente seguro): `npm run db:check` executa `SELECT 1` e consultas sem tokens nas três tabelas. O servidor registra somente categorias fixas `DB_*`; nunca mensagens, URLs, senhas ou tokens.
