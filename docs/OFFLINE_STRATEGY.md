# Estrategia Offline

## MVP

Cloud-first. PDV, KDS e fiscal dependem de conexao. A UI deve mostrar estado offline e evitar prometer operacao completa sem internet.

## Fase 2

- PWA com cache.
- Fila local limitada para pedidos.
- Sincronizacao com idempotencia.
- Deteccao de conflito.
- Bloqueio de operacoes fiscais criticas fora de contingencia definida.

## Fase 3

- Servico local/edge por filial.
- Sync engine.
- Impressao local resiliente.
- Operacao hibrida para casas com alta exigencia de disponibilidade.
