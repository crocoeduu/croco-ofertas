# Validação — 14 de outubro de 2026

Projeto usado: `crocoeduu/croco-ofertas`, branch `main`, Vercel `croco-ofertas`, Supabase `croco-ofertas`. Domínio de testes OAuth e aplicação: https://croco-ofertas.vercel.app. Nenhum segredo está neste registro.

## Evidência real em produção

- Supabase SQL Editor: três registros em `public.meli_connections`, três sessões ativas e três pares de access/refresh tokens em envelopes criptografados (`ciphertext`, `iv`, `authTag`). A chave AES não foi alterada.
- O usuário concluiu OAuth e confirmou **Conectado** no frontend. O código só mostra esse status após consultar a sessão no banco.
- Login: HTTP 302 para `auth.mercadolivre.com.br`, callback exata e PKCE S256. Runtime Logs confirmam `DB_READY` depois de `SELECT 1` e validação das tabelas.
- Migração aplicada em schema privado `offers`: `products`, `price_observations`, `coupons`; RLS ativo e sem leitura por `anon`/`authenticated`. Data API permanece desligado, banco acessado por `pg` com TLS verificado.
- Busca de anúncios `/sites/MLB/search`: 403 real para esta aplicação/conta. O catálogo respondeu com produtos ativos, mas sem `buy_box_winner`.
- Recurso `/products/{id}/items`: devolveu anúncios com preço numérico, moeda BRL e ID válido. Um 404 individual inicialmente abortava a página; tratamento corrigido para preservar os outros produtos e construir permalink de catálogo quando ausente.
- O usuário repetiu busca de JBL e confirmou **Produtos com preços / tudo funcionando**.
- Consulta real posterior: **20 produtos**, **20 observações**, todas com BRL e preço positivo, **zero duplicações na mesma hora**; três conexões e sessões preservadas. Última coleta verificada: `2026-10-14 22:28:01.593098+00`.
- Inserts em lote, deduplicação horária e cupom manual não verificado foram testados em transação com rollback no banco real. Dados artificiais desse teste não ficaram persistidos.
- Página inicial, Radar e health: HTTP 200. APIs privadas sem sessão: HTTP 401 e no-store. Callback sem parâmetros: HTTP 400.

## Checks

`npm ci`, lint, typecheck, **116 testes em 10 arquivos**, security check, build, smoke de produção local e `npm audit --audit-level=high` passaram. Audit: zero vulnerabilidades. CI GitHub do código funcional `08c9bfcfa8669160b96faeef1ab1a3fa79ad9964`: success.

Os testes automatizados de Mercado Livre usam fixtures. A confirmação externa descrita acima foi feita separadamente pela sessão real do usuário, Runtime Logs e banco real. Nenhuma credencial ou token foi publicado.

## Limites desta etapa

- Histórico começa nas consultas reais, até uma amostra por hora/anúncio/sessão. Coleta automática agendada ainda não está habilitada.
- Score inicial é provisório; comparação histórica exige três dias anteriores com coletas comparáveis. Algoritmo e exclusão de dias repetidos foram testados; não foi fabricado histórico retroativo.
- Cupons manuais têm código, validade e condições, ficam não verificados e não alteram preços/score. O teste transacional não comprova a aplicação de um cupom no checkout externo.
- Links atuais são do produto/anúncio, sem promessa de comissão. `AffiliateLinkProvider` e `DistributionProvider` são contratos para as próximas integrações; nenhum envio ao WhatsApp foi habilitado.
- A geração oficial de links afiliados depende do acesso ao programa. Distribuição depende de canal, destinatários aprovados e capacidades oficiais do provedor, sem automatizar WhatsApp Web.
