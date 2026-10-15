# Operação do Croco Ofertas

## Fluxo diário

Dashboard → Radar → Monitorar ou Aprovar → Adicionar meu link (produto e anúncio preenchidos) → Ofertas → Revalidar e preparar → Fila → Simular.

Ofertas e links são conceitos separados. Sem link suportado e ativo, o administrador continua analisando o anúncio original, mas a divulgação afiliada fica pendente. A titularidade é declaração do administrador, nunca uma confirmação da API do Mercado Livre. Nenhuma URL é construída pelo Croco para atribuir comissão.

## Limites oficiais e links

O [Mercado Livre](https://www.mercadolivre.com.br/l/afiliados-primeiros-passos) oferece links curtos e completos gerados em sua Central/Barra. Não foi encontrada documentação pública de API de geração nem uma especificação pública que comprove atribuição para os parâmetros `extra_comm`, `brand_comm`, `polycard_client`, `wid` e `sid` do exemplo fornecido.

O formato curto oficial `/sec/` pode ser ativado após confirmação administrativa de geração e destino. Links completos de páginas de produto podem ser preservados integralmente como **pendentes**; nunca são usados pelo redirect, MessageComposer ou fila. `wid` e `pdp_filters=item_id` devem apontar para o mesmo anúncio. O vínculo de catálogo é obtido no banco a partir dos dados oficiais, não de um campo controlado pelo cliente. `meli.la` permanece bloqueado porque a pesquisa não encontrou confirmação oficial suficiente desse formato para o Programa brasileiro.

Caso MLB4609951889: validação automatizada confirma HTTPS, host e consistência do produto, preservando parâmetros e fragmento. Isso **não comprova atribuição nem titularidade**. O link não foi ativado nem cadastrado como afiliado real em Production. Para comprovação de receita, será necessária uma fonte oficial; o dashboard mostra somente cliques próprios.

A saída `/go/mercadolivre/[id]` mantém confirmação por clique, proteção de origem, intenção assinada de uso único, lookup server-side e registro antes do redirect. Não existe parâmetro de destino arbitrário. Publicidade permanece explícita.

## Score e histórico

Score v2 mantém pesos transparentes: até 65 por queda versus mediana das medianas diárias, até 20 por desconto informado no anúncio, 10 por frete grátis informado e 5 por condição nova. Sem três dias anteriores distintos, o resultado é provisório, limitado a 35. Produto explicitamente indisponível recebe zero. Afiliados e cupons manuais não aumentam score. Desconto anunciado alto com queda registrada inferior a 3% gera ressalva, sem acusação de fraude.

O gráfico suporta 7, 30 e 90 dias e informa mínimo registrado pelo Croco, máximo, média, contagem e datas. A comparação considera a mesma moeda e condição. Locks ordenados impedem coletas simultâneas repetidas na mesma hora, inclusive entre sessões da mesma conta. Dados antigos são preservados.

## Distribuição e WhatsApp

O único modo implementado é **DRY RUN**. Simular não envia externamente, não marca `sent`, não cria comprovante e não altera histórico de envios reais. A fila exige aprovação, disponibilidade e preço revalidados, link ativo, canal público declarado, score e deduplicação. O servidor reavalia limites e pausa. Repetição da mesma simulação é idempotente. Máximo de três tentativas; autenticação, política e rate limit acionam pausa. Ofertas desativadas não são reativadas por simulação.

Modelos Curto, Completo, Preço baixo e Moderado só usam dados confirmados, preservam URL e publicidade e não inventam urgência. Campanhas internas selecionam canal, score, categoria, intervalo e modelo; não modificam URLs.

[Meta Business Messaging Policy](https://business.whatsapp.com/policy/preview?lang=pt_BR) exige observar consentimento e regras de mensagens. A documentação oficial de Groups da Meta retornou 429 no ambiente de pesquisa. A [documentação técnica do provedor 360dialog](https://docs.360dialog.com/docs/messaging/groups) descreve Groups API com OBA e até oito participantes, convite e restrições. Isso não habilita envio para qualquer grupo, comunidade ou canal comum. Não foi configurado transporte ou conta de WhatsApp. Providers são stubs que falham explicitamente. Nenhuma sessão QR/cookie/WhatsApp Web foi implementada. Aprovação automática e WhatsApp continuam indisponíveis até integração específica validada oficialmente.

## Coleta, limites e custos

Uma execução coleta no máximo três produtos por padrão (configurável de um a cinco), em ordem de vencimento da watchlist. Há lease de dois minutos, intervalo mínimo de uma hora entre execuções, timeout das chamadas oficiais e backoff de 15/30/60 minutos, limitado a 24 horas. Três falhas exigem revisão. Restrições de API não são contornadas por novos endpoints. A busca pode atualizar alertas de produtos já monitorados.

A rota protegida `/api/jobs/collection` está preparada para cron com `Authorization: Bearer CRON_SECRET`; sem segredo válido, retorna 403. Não existe diagnóstico público de banco. Para planos Hobby, a [Vercel permite cron diário](https://vercel.com/docs/cron-jobs/manage-cron-jobs). **Agendamento automático ainda não ativado:** o conector de variáveis retornou 403 de escopo e não há segredo novo configurado. A coleta manual autenticada está disponível em Monitoramento. Frequência inicial recomendada: uma execução diária, orçamento três; qualquer custo adicional deve ser revisto antes de aumentar.

O pool pg continua com no máximo três conexões por instância, TLS validado e sem supabase-js/Data API. Consultas de produtos/histórico/links são em lote; dashboards são limitados a 300 produtos, fila/ofertas a 100 e notificações a 50. Não há worker permanente, WebSocket ou infraestrutura paga adicional.

## Segurança e feature flags

Todas as páginas operacionais e APIs de mutação exigem sessão ativa da conta explicitamente autorizada no servidor. CSRF/Origin, cookies HttpOnly, criptografia AES-GCM com contexto, refresh com lock, TLS e rate limit permanecem. Páginas administrativas são noindex/nofollow. CSP mantém nonce; imagens usam allowlist compartilhada, HTTPS e fallback sem proxy.

As preferências persistidas habilitam watchlist, limites e simulação. `WATCHLIST_ENABLED=false` e `DISTRIBUTION_ENABLED=false` no servidor podem suspendê-las. `DRY_RUN` é efetivamente obrigatório; `AUTO_APPROVAL_ENABLED` e `WHATSAPP_ENABLED` ainda não podem habilitar recursos sem adapter. Segredos nunca entram no client ou no exemplo de ambiente. O botão PAUSAR AUTOMAÇÃO é aplicado no servidor antes de simular.

As novas tabelas ficam no schema privado `offers`, com RLS e grants revogados. Auditoria registra somente entidade, ID, ação e horário; sem URLs, tokens, IPs ou conteúdo de mensagens. Cliques não armazenam IP bruto. Mensagens da fila são dados operacionais, não contêm credenciais.

## Retenção e recuperação

A coleta limpa somente states OAuth e rate limits expirados, em lotes de até mil. Marca itens antigos/leases vencidas sem apagar histórico útil. Cliques e auditoria: retenção operacional inicial de 180 dias, revisão administrativa antes de qualquer expurgo; não existe rotina destrutiva ativada. Histórico de preços, conexões, links e configurações não são apagados pela manutenção.

Use backups/PITR do plano Supabase quando disponíveis. Em plano sem PITR, faça backup PostgreSQL em destino privado criptografado e com acesso restrito; inclua `public.meli_connections` e o schema `offers`. Nunca publique dump nem copie chaves para o Git. Conexões contêm envelopes criptografados e dependem da mesma chave mantida separadamente no Secret da Vercel. Restaurar em projeto isolado, aplicar migrations em ordem, conferir RLS/grants, testar TLS/SELECT 1, contagens, OAuth e leitura administrativa antes de apontar Production. Não redefina a chave para “corrigir” dados existentes.

Rollback de código: deployment anterior `dpl_Ah7W89CiPf2vZ9srHBvGDJ8tzgVk`, commit `1be0ddc6d096a0ec6da6122e0ec6b2630102ed56`. As migrations incrementais são compatíveis com a versão anterior. Promover esse deployment não exige apagar tabelas ou restaurar tokens. Validar o alias estável e logs após qualquer promoção.

## Testes e limites de evidência

`npm ci`, lint, typecheck, unitários/integração, security check, build, smoke e audit devem passar. `npm run test:e2e` usa componentes reais com APIs simuladas em servidor Vite isolado, fora de `app/`; não cria bypass de login em Production. Projetos de viewport: 320, 375, 390, 430, 768 e 1440 pixels. CI não usa segredos reais. Esses testes não substituem a autorização real do Mercado Livre nem uma compra atribuída oficialmente.
