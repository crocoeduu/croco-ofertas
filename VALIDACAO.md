# Validação da entrega

Validação executada no Windows com Node.js 24.20.0 e npm 12.0.2. Dependências estáveis confirmadas no registro npm: Next.js 16.4.0 e React 19.3.0.

| Verificação | Resultado |
| --- | --- |
| npm install | Concluído; lockfile incluído |
| npm run lint | Aprovado, sem ignorar erros |
| npm run typecheck | Aprovado |
| npm test | 53 testes aprovados em cinco arquivos |
| npm run security:check | Aprovado |
| npm run build | Concluído; página e três APIs compiladas, proxy CSP incluída |
| npm run test:smoke | Aprovado contra o servidor compilado em produção local |
| npm audit | Zero vulnerabilidades |
| git check-ignore | Todos os ambientes privados, .vercel, .next e node_modules ignorados |
| Browser desktop/mobile | Interface renderizada, sem overflow horizontal em mobile e sem erros no console |

Os testes cobrem state, PKCE, vetor SHA-256 da RFC 7636, URI exata nos dois passos, ambientes inválidos, callback sem code/state/verifier, consentimento negado, respostas externas inválidas, timeout sem retry, erros sanitizados, nonce/criptografia autenticada, armazenamento parametrizado, refresh rotacionado sob trava, replay persistente e rate limit. A API do Mercado Livre é simulada nos testes.

O smoke injeta sentinelas aleatórias somente no processo do servidor e verifica ausência no HTML, JS e respostas de erro. Também verifica CSP com nonce, HTTP 400 da callback sem parâmetros, redirect exclusivo ao host oficial quando há configuração de teste, cookies seguros e HTTP 404 em endpoints de debug/admin/arquivos de ambiente.

## Publicação e testes públicos

Repositório público: [crocoeduu/croco-ofertas](https://github.com/crocoeduu/croco-ofertas), branch `main`. O [CI principal no GitHub Actions](https://github.com/crocoeduu/croco-ofertas/actions/runs/38504653069) concluiu com sucesso após a publicação do código. Dependabot está ativo; PRs automáticos de atualização não foram mesclados.

Projeto Vercel: `croco-ofertas`, Node.js 24.x, conta `eduardolu3s-projects`. O deploy de produção foi criado a partir do código do GitHub e chegou ao estado **READY**. O escopo padrão da conta autenticada permitiu a publicação no mesmo projeto/conta verificados.

Domínio estável real confirmado pela API da Vercel e por requisições públicas: **croco-ofertas.vercel.app**.

| URL | Verificação pública |
| --- | --- |
| https://croco-ofertas.vercel.app/ | HTTP 200, interface da Central de Ofertas |
| https://croco-ofertas.vercel.app/api/health | HTTP 200, exatamente `{"status":"ok"}` |
| https://croco-ofertas.vercel.app/api/mercadolivre/callback | HTTP 400 sem parâmetros, mensagem amigável, no-store |
| https://croco-ofertas.vercel.app/api/mercadolivre/login | HTTP 503 amigável enquanto faltam Client ID/Secret, no-store |

Callback exata para cadastrar no Mercado Livre: **https://croco-ofertas.vercel.app/api/mercadolivre/callback**. O valor já foi configurado como `MELI_REDIRECT_URI` no ambiente Production da Vercel.

Ainda é necessário configurar na Vercel: `MELI_CLIENT_ID` e `MELI_CLIENT_SECRET`, e fazer novo deploy. Banco opcional: `DATABASE_URL` e `TOKEN_ENCRYPTION_KEY`, sempre em conjunto, e migração do esquema. Não foram colocadas credenciais fictícias na produção.

Não foram realizadas autorização real do Mercado Livre, persistência em PostgreSQL real nem rotação real de tokens, porque não foram fornecidos/configurados esses serviços e credenciais. Os adapters de banco e refresh foram testados com mocks. Sem banco, o cooldown de login pode ser contornado apagando cookies e não existe trava distribuída de callback; veja limites e configuração no README.
