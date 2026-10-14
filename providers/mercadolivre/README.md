OAuth, cliente privado e busca estão em `lib/mercadolivre`. A busca usa o endpoint oficial `/sites/MLB/search`, com token apenas no backend, timeout, paginação limitada e normalização BRL. A disponibilidade depende das permissões da aplicação/conta; um 403 retorna `MELI_SEARCH_FORBIDDEN`, sem invalidar a sessão ou modificar tokens. Não há scraping, contorno de bloqueio ou dados de demonstração em produção.

Referência: https://developers.mercadolivre.com.br/pt_br/itens-e-buscas

Busca e link afiliado são integrações separadas. O OAuth de vendedor/conta não comprova participação no programa de afiliados. `AffiliateLinkProvider` e `DistributionProvider` continuam como contratos para a próxima etapa; nenhum link de comissão é inventado e nenhum WhatsApp é enviado.
