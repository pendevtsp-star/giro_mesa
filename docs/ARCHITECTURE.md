# Arquitetura

## Decisao

Usar modular monolith com API NestJS/Fastify, web Next.js PWA, worker BullMQ e PostgreSQL compartilhado. Separar regras reutilizaveis em pacotes do monorepo.

## Componentes

- `apps/web`: landing, painel, mobile do garcom via PWA, cardapio QR e backoffice.
- `apps/api`: contratos HTTP, auth, tenant context, RBAC, PDV, KDS, catalogo, webhooks e integracoes.
- `apps/worker`: filas de webhooks, fiscal, mensagens, estoque, auditoria e outbox.
- `packages/domain`: state machines, calculos e interfaces.
- `packages/db`: schema Drizzle e migrations.
- `packages/config`: env e nomes de filas.
- `packages/ui`: componentes compartilhados.

## Principios

- Transacoes para operacoes de venda, estoque, caixa e pagamento.
- Locks pessimistas em fechamento de conta/caixa; locks otimistas por `version` em edicoes concorrentes.
- Webhooks idempotentes.
- Auditoria append-only.
- Providers substituiveis para pagamentos, fiscal, WhatsApp, e-mail, storage e marketplaces.
