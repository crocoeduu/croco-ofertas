OAuth, cliente privado e busca estão em `lib/mercadolivre`. A busca usa o endpoint oficial `/sites/MLB/search`, com token apenas no backend, timeout, paginação limitada e normalização BRL. A disponibilidade depende das permissões da aplicação/conta; um 403 retorna `MELI_SEARCH_FORBIDDEN`, sem invalidar a sessão ou modificar tokens. Não há scraping, contorno de bloqueio ou dados de demonstração em produção.

Referência: https://developers.mercadolivre.com.br/pt_br/itens-e-buscas

Quando a busca de anúncios retorna 403, consulta-se o buscador oficial de catálogo `/products/search?site_id=MLB&status=active&q=...` e os detalhes `/products/{id}`. Somente `buy_box_winner` com preço BRL e ID de anúncio válido é registrado. O histórico continua sendo do anúncio vencedor, não do agregado do catálogo. O link é o permalink oficial do produto de catálogo; confirme a oferta/preço escolhido no checkout. Não há inferência de preço a partir de títulos, ranges, Google ou páginas HTML. Referência: https://developers.mercadolivre.com.br/buscador-de-produtos

Se também houver 403 no catálogo, a consulta termina com diagnóstico allowlisted (`POLICY_DENIED`/`FORBIDDEN` e nome fixo do recurso). A aplicação não eleva escopos, tenta outros tokens ou contorna a política do provedor. 401, 429 e falhas de rede não disparam fallback.

Na validação real de outubro de 2026, o catálogo retornou 20 produtos ativos sem `buy_box_winner`. Nessa situação a implementação consulta `/products/{id}/items`, com o mesmo token e limite de cinco anúncios por produto. Um 403 nesse recurso encerra a consulta imediatamente com `MELI_PRICES_FORBIDDEN`. Apenas anúncios com ID válido, preço numérico positivo, BRL informado pela API e permalink seguro podem alimentar o histórico. Logs contêm somente contagens de campos presentes, sem valores brutos ou dados da conta.

Busca e link afiliado são integrações separadas. O OAuth de vendedor/conta não comprova participação no programa de afiliados. `AffiliateLinkProvider` e `DistributionProvider` continuam como contratos para a próxima etapa; nenhum link de comissão é inventado e nenhum WhatsApp é enviado.
