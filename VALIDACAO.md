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

## Publicação pendente

O conector Vercel retornou **403 forbidden** ao tentar criar `croco-ofertas` no escopo existente `eduardolu3s-projects`. O CLI informou não estar autenticado. Não foi criado projeto ou domínio remoto.

O conector GitHub identificou a conta `crocoeduu`, mas não oferece criação de repositório. A página oficial de criação abriu a tela de login. A entrega contém repositório Git local na branch `main`; não houve push remoto.

**Domínio real, site público, health público, callback HTTPS e login público: ainda não disponíveis.** As rotas foram implementadas e testadas localmente. Não use `croco-ofertas.vercel.app` como callback até confirmar a atribuição real após o deploy.

Ainda é necessário configurar na Vercel: `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET`, `MELI_REDIRECT_URI` com o domínio estável confirmado. Banco opcional: `DATABASE_URL` e `TOKEN_ENCRYPTION_KEY`, sempre em conjunto, e migração do esquema.

Não foram realizadas autorização real do Mercado Livre, persistência em PostgreSQL real nem rotação real de tokens, porque não foram fornecidos/configurados esses serviços e credenciais. Os adapters de banco e refresh foram testados com mocks. Sem banco, o cooldown de login pode ser contornado apagando cookies e não existe trava distribuída de callback; veja limites e configuração no README.
