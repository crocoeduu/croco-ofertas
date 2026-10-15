# WhatsApp: recuperação e implantação, 15/10/2026

Workspace original recuperado integralmente em `/workspace/scratch/f74275d0ea1d/croco-ofertas`, sobre main ff082f8216550b0d9467bffbd1cc363408482e0c. O checkpoint antigo continua preservado como registro histórico em `docs/checkpoints/whatsapp-20261015.md`; o estado atual é descrito aqui e no README do worker.

## Banco preservado

Migration `20261015143843_whatsapp_delivery_control` **já aplicada, não reaplicada**. Seu arquivo foi comparado byte a byte com o checkpoint. O runner agora consulta journal sob lock transacional, ignora versões existentes e falha em schema inicial parcial; testes usam mocks, sem migrations em produção. Não há migration automática no build/OAuth.

Consulta real nesta retomada: SELECT 1 OK; 4 conexões OAuth, 49 registros de produtos, 1 link afiliado, 52 observações de preço, migration no journal, zero snapshots de envios e zero permissões de primeiro teste. Os tokens não foram consultados em claro. Queries operacionais são validadas com PREPARE/DEALLOCATE dentro de BEGIN/ROLLBACK; isso comprova sintaxe/tipos/schema, não substitui teste com conta WhatsApp conectada.

## Código entregue

- `lib/whatsapp`: configuração, política, composer, providers, heartbeat/bridge, HMAC, fila, dispatch, planner e contrato de UI.
- APIs administrativas WhatsApp/QR e bridge interno autenticado; página `/configuracoes/whatsapp` e navegação.
- `workers/whatsapp`: processo Node, driver transparente, sessão AES-GCM, diário de idempotência, protocolo/mídia, healthcheck, preflight, Docker/compose e documentação de hospedagem.
- Afiliados: meli.la intacto, confirmação administrativa e origem declarada, fallback exato de canal/campanha; link pendente não é monetização pronta.
- Runner de migrations, testes backend/worker/UI, CI, smoke/security e documentação revisados.

OAuth, PKCE, state, refresh, criptografia de tokens, TLS pg e autorização administrativa existentes permanecem preservados. O worker não recebe credenciais do banco nem tokens Mercado Livre. QR fica temporário, cifrado e restrito ao administrador; nunca vai para logs.

## Segurança da distribuição

Claim atômico com SKIP LOCKED, token e lease; falha anterior ao transporte tem recuperação limitada. Entrega incerta após handoff nunca volta a envio automático. O worker grava a reserva no diário antes do transporte e não repete IDs incertos. Não há promessa de entrega exatamente uma vez pela rede. Kill switch é consultado no servidor antes do transporte, após baixar mídia; mensagem já entregue ao transporte não pode ser desfeita.

Conservador/manual por padrão. Produto, preço, disponibilidade, score e affiliate link são revalidados no Croco. Affiliate readiness não soma score. Deduplicação considera produto/catálogo/destino, preço, score, intervalo e diversidade. Janela São Paulo, limites horários/diários e kill switch. Sem evidência de cupom/parcelamento, omite esses blocos. Falha de mídia anterior ao transporte permite somente texto ou revisão; falha ambígua não dispara segunda mensagem.

HMAC com timestamp e nonce, proteção persistente contra replay e rate limit distribuído. Rotas admin exigem sessão, allowlist server-side e origem exata nas mutações. Redirecionamentos/URLs não são recebidos como destinos arbitrários. IDs/conta são mascarados no painel. O diário local guarda IDs e recibos, não textos nem destinatários.

## O que funciona e o que falta

| Etapa | Estado nesta implantação |
| --- | --- |
| Radar, histórico, score, aprovação e afiliados | Implementados; dependem das evidências e do link ativo para cada produto/canal |
| Link informado `https://meli.la/1ByLVY1`, MLB4609951889 | Vínculo declarado pelo administrador neste pedido; não é comprovação via API do Mercado Livre; o registro antigo pendente não foi ativado por suposição |
| Composer/fila/claim/revalidação/Mock | Exercitados em DRY RUN integrado com fixtures; sem mensagem externa |
| SQL da fila e constraints | Validação no PostgreSQL real; QA transacional sem persistir fixtures |
| Worker persistente e sessão cifrada | Implementados e testados localmente; sem host contratado/iniciado |
| Provider Web Session | Opcional, NÃO OFICIAL, desabilitado por padrão; conexão real e backup após QR ainda não validados no host |
| Cloud/Groups oficiais | Adapters separados, desativados; elegibilidade e suporte ao destino real não confirmados |
| Canais/comunidades | Não anunciados como suporte real; o inventário do driver lista grupos em que a conta é administradora |
| Conta WhatsApp/destino | Aguardam host, secrets, QR e escolha/declaracão administrativa pelo ID |
| Primeiro envio | Bloqueado até autorização literal específica; não ativa automação |
| Automação contínua | Exige outra autorização, flags e confirmação de recebimento no destino |

## Pesquisa e hospedagem

Consultar [README do worker](../workers/whatsapp/README.md) para requisitos medidos, estimativas identificadas, comandos, nomes de variáveis e roteiro Vertra. Node 24, Chromium/Puppeteer; sem HTTP de entrada. 256 MB inadequados; 512 MB sem margem; Vertra recomenda 1 GB para a biblioteca. Compose reserva 2 GB/1 vCPU como margem operacional, sem benchmark com conta real. Dependências ocupam 71 MiB sem Chromium; importação sem navegador mediu RSS 73 MiB. Não tratar esse número como consumo conectado. Volume cifrado durável e runtime em tmpfs obrigatórios; sandbox permanece ativo. Nenhum plano comprado.

A documentação da Vertra confirma Node contínuo, Chromium e sessões, mas o exemplo usa flags sem sandbox, que não foram adotadas. Compatibilidade deste worker depende de sandbox não privilegiado, tmpfs e volume entre redeploys no plano escolhido. Se não suportar, Vertra é inadequada; usar host Linux/Docker compatível, sem contratação automática.

Fontes consultadas: https://docs.vertracloud.app/tutorials/whatsapp-bot ; https://vertracloud.app/runtimes/javascript ; https://docs.vertracloud.app/deploy-github ; https://docs.vertracloud.app/plans-and-limits ; https://www.mercadolivre.com.br/l/checklist ; https://www.mercadolivre.com.br/l/afiliados-compartilhamento-de-publicacao ; https://www.whatsapp.com/legal/business-policy/ ; https://wwebjs.dev/guide/creating-your-bot/authentication.html . A leitura direta da documentação Meta Groups ficou indisponível nesta sessão; nenhuma API/eligibilidade foi inventada. Geração de afiliado continua manual por ferramenta oficial; declaração de titularidade não equivale a validação Mercado Livre. Divulgação requer canais públicos e declarados conforme regras atuais do programa; não garante comissão/venda elegível.

## Testes e publicação

As evidências finais de CI, SHA e deploy devem ser consultadas no histórico GitHub/Vercel do commit publicado, evitando um documento alegar antecipadamente CI verde. A suite inclui instalação reproduzível, lint, typecheck, backend, worker, security scan, build, smoke, UI em seis viewports e auditorias separadas. Não há segredo nem transporte WhatsApp real em CI.

## Sequência que depende do administrador

Confirmar hospedagem compatível → contratar por conta própria → injetar secrets nos painéis → iniciar worker/preflight → escanear QR → escolher ID do grupo público e declarar permissão → cadastrar/ativar link oficial no canal correto → aprovar preview/DRY RUN → parar. Somente após “pode enviar o primeiro teste”, habilitar um teste neutro único. Confirmar recebimento e aguardar autorização separada da automação. Nesta implantação WHATSAPP_SEND_ENABLED/AUTO_SEND_ENABLED continuam bloqueados.
