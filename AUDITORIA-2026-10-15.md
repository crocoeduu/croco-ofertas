# Auditoria e evolução · 15/10/2026

Baseline Production: commit `1be0ddc6d096a0ec6da6122e0ec6b2630102ed56`, deployment `dpl_Ah7W89CiPf2vZ9srHBvGDJ8tzgVk`. Rollback de código: promover esse deployment pelo painel Vercel; migrations novas são aditivas e dados antigos não devem ser apagados para rollback.

Baseline confirmado no Supabase: SELECT 1, 3 conexões e 3 sessões ativas, 46 produtos, 49 observações, zero links afiliados. Testes baseline: 169/169.

## Prioridades reproduzidas

- P0: validador só permite /sec/ e rejeita URL original de página /up/ com item_id. A documentação oficial permite escolher link curto ou completo; a confirmação de sintaxe não comprova atribuição/titularidade.
- P0: somente um host de imagens permitido no normalizador e CSP; exemplos oficiais do catálogo usam também mla-s1-p/mla-s2-p.mlstatic.com. Thumbnail vazia impedia usar fallback válido. Imagem quebrada não possuía tratamento de erro no card.
- P1: três imagens reais amostradas no banco retornaram GET 200 image/jpeg (128598, 166877 e 325895 bytes). HEAD retornou 405 ou timeout: não serve como prova de imagem quebrada. A causa visual relatada não pode ser atribuída a arquivo ausente com essa evidência. Login Mercado Livre deste navegador de teste apresentou erro genérico antes do formulário; a auditoria visual autenticada depende dessa limitação externa.
- P1: produto sem afiliado tem botão de oferta desabilitado e nenhum acesso ao anúncio original, impedindo análise administrativa.
- P1: afiliados mistura cadastro, CSV, configurações e preparação em página extensa; campos técnicos exigem copiar códigos e URL manualmente.
- P1: ausência de navegação operacional, filtros, estados de carregamento e gráficos de histórico.
- P2: watchlist, notificações, dashboard, configurações persistidas e fila dry run ainda não existem.
- P3: transporte externo, Shopee e validação oficial de receitas permanecem dependentes de integrações oficiais e autorização/configuração específicas.

## Limites de auditoria

Conectores de Runtime Logs Vercel (403) e SQL Supabase (sem permissão) não retornaram dados. SQL auditado pelo painel autenticado autorizado. Não interpretar falha de ferramenta como ausência de erros. Nenhuma senha, token, URL de conexão ou cookie foi lido no diagnóstico.

## Referências oficiais

- Mercado Livre: `/l/afiliados-primeiros-passos`: opção de link curto/completo; `/l/afiliados-gere-seus-links`: gerar e copiar na Central/Barra; `/buscador-de-produtos`: imagens e recursos oficiais de catálogo.
- WhatsApp: documentação Meta Groups API retornou 429 neste ambiente. Política oficial Business foi consultada. Documentação técnica do provedor 360dialog descreve Groups API com OBA e limite de 8 participantes; isso não equivale a autorização para automatizar qualquer grupo comum. Transporte continuará desabilitado e a fila será simulada.
- Supabase changelog atual: alteração TLS 1.2 refere-se a APIs HTTP; aplicativo continua em pg com TLS explícito. Alterações de ltree/PGP/btree_gist não são usadas nesta arquitetura (tokens usam AES-GCM Node).
