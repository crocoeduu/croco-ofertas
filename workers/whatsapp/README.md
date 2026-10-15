# Worker WhatsApp do Croco

Implementação opcional **NÃO OFICIAL**, desabilitada por padrão. Não é a Cloud API da Meta. Grupos comuns/canais do aplicativo não são apresentados como destinos oficiais da Groups API. WhatsApp pode restringir contas que usam automação não autorizada; a autorização do proprietário não equivale a uma autorização da Meta. Use número dedicado.

O worker é um serviço Node 24 persistente separado da Vercel. A implantação deste repositório na Vercel **não** inicia o worker. Nenhuma hospedagem foi contratada nesta etapa. Requer um servidor/container já autorizado, volume persistente, RAM para Chromium e suporte ao sandbox do Chromium com usuário sem privilégios. Não remover o sandbox para contornar uma configuração de host incompatível.

## Configuração

No servidor Vercel: `WHATSAPP_WORKER_SECRET` (32 bytes em hexadecimal), `WHATSAPP_WEB_SESSION_ENABLED=true` somente após escolha administrativa. `WHATSAPP_SEND_ENABLED=false` e `AUTO_SEND_ENABLED=false` permanecem desligados até as autorizações específicas. Ausência dessas flags também bloqueia.

No worker, guardar em `.env.local` fora do Git: os mesmos `WHATSAPP_WORKER_SECRET` e `WHATSAPP_WEB_SESSION_ENABLED`; `WHATSAPP_WORKER_ID` estável (letras/números/hífen), `WHATSAPP_SESSION_ENCRYPTION_KEY` (outra chave independente de 32 bytes em hexadecimal) e `WHATSAPP_SEND_ENABLED=false`. Não copiar DATABASE_URL, credenciais OAuth ou TOKEN_ENCRYPTION_KEY para o worker.

`npm ci --ignore-scripts` dentro desta pasta; `PUPPETEER_SKIP_DOWNLOAD=true`. O Chromium do host/container é usado. `docker compose up --build` usa o arquivo de configuração local do operador. Nunca executar com credenciais reais em CI. O runtime `/run/croco` e `/tmp` devem estar em tmpfs; os arquivos persistentes da sessão ficam cifrados com AES-256-GCM, nonce aleatório e contexto por conexão. O disco recebe somente arquivo cifrado e um diário de IDs de envio sem textos/telefones. A sessão legível do Chromium existe em RAM enquanto está conectada.

A dependência whatsapp-web.js 1.34.7 usa Puppeteer 25.14.0 fixado por override para retirar as cadeias vulneráveis de extração/download. Instanciação testada; operação real da conta requer validação após QR no host escolhido. Revisar a compatibilidade de Chromium/sandbox nesse host. A estratégia TransparentRemoteAuth inicia o Chromium com Puppeteer antes de usar o caminho documentado de conexão da biblioteca. Isso evita a flag de ocultação de webdriver adicionada pelo lançamento padrão do whatsapp-web.js. userAgent=false e bypassCSP=false. Não há stealth, identificação mascarada, flags anti-detecção ou retries para contornar bloqueios. Reconexão exige ação administrativa.

## Fluxo administrativo

1. Em `/configuracoes/whatsapp`, escolher o provider, ler o aviso e habilitar apenas a conexão.
2. Iniciar o worker e conferir heartbeat. Conectar apresenta QR temporário apenas para administrador autenticado.
3. Escanear QR no telefone da conta escolhida. Escolher explicitamente um ID listado; declarar que o destino é público e permitido/declarado no programa de afiliados.
4. Registrar os links meli.la oficiais para os produtos corretos; selecionar canal/campanha. Gerar links permanece manual na Central Mercado Livre.
5. Preparar/aprovar oferta e executar preview/DRY RUN. Sem preço/score/estoque/link/destino válidos, não entra em envio.
6. **Parar**. Depois de autorização explícita “pode enviar o primeiro teste”, habilitar somente a flag de teste de envio nos dois serviços e emitir uma autorização única para a mensagem fixa de teste. `AUTO_SEND_ENABLED` continua falsa. A permissão expira e não é reutilizada.
7. Confirmar recebimento no destino correto. A automação só pode ser habilitada em outra ação explícita, com todas as flags e confirmação do destino. O primeiro teste nunca ativa a automação.

Desconectar invalida o vínculo e pausa. Apagar sessão solicita logout e remoção do arquivo cifrado no worker. Confirmar a desconexão nos aparelhos conectados do aplicativo quando o worker estiver offline. O painel não afirma que uma sessão foi apagada remotamente enquanto o worker não tiver executado a operação.

## Entrega e limites

O Croco decide preço, score, link e aprovação; o worker não tem acesso ao banco nem a tokens Mercado Livre. HMAC cobre corpo/caminho/timestamp/nonce; replay é bloqueado no PostgreSQL. A fila usa claim atômico com SKIP LOCKED, token de claim e lease. Preflight pode ser recuperado antes do envio; após entrega ao transporte, timeout/crash é **ambíguo**, exige revisão e não é repetido automaticamente. APIs WhatsApp não oferecem garantia geral de exatamente uma entrega; a implementação prioriza evitar repetição e não promete o impossível.

Imagem vem somente dos hosts explícitos mlstatic, com HTTPS, redirect bloqueado, timeout, limite de 5 MB e cache em RAM de dez minutos (máximo oito imagens). Falha antes do envio permite texto ou revisão, conforme configuração. Falha incerta depois de chamar o transporte nunca tenta texto como segundo envio. Caption até 1.024 caracteres; texto até 4.096. Nenhum cupom/parcelamento sem evidência oficial. Mensagem contém preço, URL intacta e `(anúncio)`.

O indicador `sent` representa aceite pelo transporte com ID de mensagem. `delivered` e `read` não são inferidos. Não há webhook oficial configurado nesta etapa; providers oficiais permanecem indisponíveis até confirmação documental/da conta. Links meli.la diretos não geram métricas de clique Croco. Não são estimadas vendas ou comissões.

`npm test` usa arquivos e providers locais de teste; não abre sessão nem envia WhatsApp. A CI verifica também o construtor do driver sem inicialização de navegador. A auditoria do worker é separada da auditoria do aplicativo.

## Hospedagem: dimensionamento e Vertra Cloud (consulta em 15/10/2026)

| Item | Requisito / evidência |
| --- | --- |
| Runtime | Node 24.x; Puppeteer 25.14.0, whatsapp-web.js 1.34.7 e Chromium Linux |
| Processo | Um processo Node contínuo e os subprocessos Chromium; uma única réplica por conta |
| 256 MB | Inadequado para este provider com navegador |
| 512 MB | Limite mínimo indicado pela Vertra para a biblioteca, sem margem garantida; não recomendado para este worker |
| 1 GB | Recomendação da Vertra para whatsapp-web.js; ponto de partida para piloto, sujeito a medição com QR/conta real |
| 2 GB | Recomendação operacional do Croco para reservar margem de navegador, tmpfs, mídia e compactação; configurado no compose, não é benchmark nem mínimo comprovado |
| CPU | Planejar 1 vCPU para piloto (recomendação de engenharia); mínimo exato e picos dependem do host e da conta, ainda não medidos |
| Disco | Dependências locais medidas: 71 MiB, sem Chromium/OS. Reservar 2 GB para imagem/instalação e volume cifrado de 1 GB inicialmente; monitorar crescimento da sessão e do diário |
| Memória medida | Importação sequencial das dependências, sem navegador: RSS 73 MiB, heap 19 MiB neste workspace. Não representa consumo conectado nem pico de compactação |
| Persistência | Volume durável para WHATSAPP_STATE_DIRECTORY, com backup cifrado; sobrevive a restart **e redeploy** |
| RAM temporária | WHATSAPP_RUNTIME_DIRECTORY em tmpfs (512 MiB no compose), /tmp em tmpfs (256 MiB), /dev/shm 256 MiB; consumo efetivo conta contra o limite de memória |
| Rede | Saída HTTPS/WSS. Sem porta de entrada; não publicar endpoint de saúde nem QR |
| Docker | Disponibilizado e recomendado para reproduzir dependências; não é requisito do protocolo se o host fornecer condições equivalentes |
| Build | Não há compilação TS: `npm ci --omit=dev --ignore-scripts`; não executar o build Next dentro do worker |
| Start | `npm start`, ou `node worker.mjs` com variáveis já injetadas |
| Health | `npm run healthcheck`, exit 0/1; testa heartbeat Croco recente, não afirma WhatsApp conectado |
| Pré-validação | `npm run preflight`: testa Node, tmpfs, escrita no volume e Chromium com sandbox, sem abrir WhatsApp |

Fontes primárias consultadas: [tutorial WhatsApp da Vertra](https://docs.vertracloud.app/tutorials/whatsapp-bot), [runtime Node](https://vertracloud.app/runtimes/javascript), [GitHub deploy](https://docs.vertracloud.app/deploy-github), [limites](https://docs.vertracloud.app/plans-and-limits). A Vertra documenta processo contínuo, Node 24, Chromium e diretório de sessão, mas seu exemplo desabilita sandbox. **Este projeto não adota essas flags.** A documentação consultada não comprova sandbox com usuário sem privilégios, montagem tmpfs nem volume durável entre redeploys no plano escolhido. Compatibilidade completa ainda depende dessa confirmação e do preflight no host; não contratar apenas pela RAM anunciada. Se essas condições não forem oferecidas, **Vertra não é adequada para este worker**. Alternativa mínima: servidor Linux com Docker, usuário sem privilégios, sandbox suportado, volume e tmpfs; não foi contratado nenhum serviço.

### Preparação do deploy Vertra

1. Antes de contratar, confirmar com o suporte as condições de sandbox/tmpfs/volume acima. Não usar `--no-sandbox`, `--single-process` ou flags de ocultação para fazê-lo caber.
2. Novo Projeto → Import from GitHub → `crocoeduu/croco-ofertas`, branch `main`. A documentação confirma importação GitHub, mas não confirma seletor de subdiretório: se o painel oferecer Root Directory, usar `workers/whatsapp`; se não oferecer, subir um ZIP **somente do conteúdo dessa pasta**, excluindo node_modules, arquivos de sessão e `.env.local`. Não iniciar o package.json Next da raiz.
3. Tipo Bot/background, runtime JavaScript, Node 24. Instalação `npm ci --omit=dev --ignore-scripts`, build sem compilação, start `npm start`. Definir caminho do Chromium instalado pelo host; com Docker, `/usr/bin/chromium`. Não presumir que a instalação automática do Puppeteer, desabilitada por segurança/reprodutibilidade aqui, fornece esse executável.
4. Uma réplica; publicar web desligado. Não habilitar deploy simultâneo/blue-green: duas réplicas do mesmo cliente residente não são suportadas. O claim no banco protege jobs, mas não substitui isolamento da sessão.
5. Montar volume durável e tmpfs nos diretórios configurados; usuário sem privilégios; configurar variáveis no painel (nomes abaixo). Não cadastrar credenciais do banco/ML no worker.
6. Executar `npm run preflight` no ambiente final. Se o host não permitir esse comando, usar processo temporário com esse start e restaurar `npm start` após o exit 0. Falha impede conexão; não enfraquecer sandbox para contorná-la.
7. Deploy; acompanhar somente códigos sanitizados. Conferir `npm run healthcheck` e heartbeat no painel Croco. QR aparece **somente** na página administrativa Croco.
8. Conectar, escanear QR, escolher destino pelo ID e declarar publicidade/autorização. DRY RUN não envia mensagem. Parar antes do primeiro teste real.

Auto-deploy GitHub na Vertra exige plano compatível segundo a documentação. Nenhum recurso Vertra foi criado. O volume precisa ser confirmado independentemente de snapshots de versão do código.

### Docker em host compatível

```sh
cd workers/whatsapp
# Configurar .env.local fora do Git e no gerenciador de secrets do host.
docker compose build
docker compose run --rm whatsapp-worker node preflight.mjs
docker compose up -d
docker compose exec whatsapp-worker node health.mjs
```

O compose não reinicia em loop: falha repetida exige revisão. Em restart limpo, restaura somente arquivo cifrado da mesma conexão; se a restauração exigir QR, para e exige Conectar no painel. Perder volume ou chave exige novo pareamento. RemoteAuth faz seu primeiro backup após estabilização da sessão; esperar persistência antes de testar restart. Desconexão/apagamento invalida o epoch e impede restaurar sessão antiga.

### Variáveis (somente nomes)

Vercel, adicionais às variáveis já existentes do aplicativo:

- WHATSAPP_WORKER_SECRET
- WHATSAPP_WEB_SESSION_ENABLED
- WHATSAPP_SEND_ENABLED
- AUTO_SEND_ENABLED

Worker:

- WHATSAPP_WORKER_SECRET
- WHATSAPP_WORKER_ID
- WHATSAPP_SESSION_ENCRYPTION_KEY
- WHATSAPP_WEB_SESSION_ENABLED
- WHATSAPP_SEND_ENABLED
- WHATSAPP_STATE_DIRECTORY
- WHATSAPP_RUNTIME_DIRECTORY
- CHROMIUM_EXECUTABLE_PATH
- PUPPETEER_SKIP_DOWNLOAD
- CROCO_ORIGIN

Os secrets devem ser criados/injetados por gerenciador seguro, nunca enviados no chat. WHATSAPP_SEND_ENABLED e AUTO_SEND_ENABLED continuam falsos nesta etapa. O worker não precisa de DATABASE_URL, TOKEN_ENCRYPTION_KEY, MELI_CLIENT_SECRET, access_token ou refresh_token.
