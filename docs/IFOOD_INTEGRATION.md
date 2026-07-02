# Integracao iFood

## Faseamento

- MVP: estrutura `MarketplaceProvider`, mapeamento interno e documentacao.
- Fase 2: autenticacao, recebimento de pedidos, status, impressao/KDS e conciliacao.
- Fase 3: sincronizacao de catalogo, disponibilidade, precos e adicionais.

## Eventos

Preferir webhook para integrador centralizado. Polling pode ser fallback, respeitando retencao e ACK apenas apos persistir evento.

## Cuidados

- Eventos podem chegar fora de ordem.
- Idempotencia por evento.
- Logs por tenant e merchant.
- Mapeamento manual assistido para produtos/adicionais.

## Referencias

- https://developer.ifood.com.br/en-US/docs/guides/modules/events/webhook-overview
- https://developer.ifood.com.br/en-US/docs/guides/modules/events/polling-overview
- https://developer.ifood.com.br/en-US/docs/guides/modules/order/workflow/?category=FOOD
