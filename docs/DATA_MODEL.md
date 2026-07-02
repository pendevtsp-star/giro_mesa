# Modelo de Dados

## Base

O banco inicial e PostgreSQL compartilhado. Todas as tabelas de negocio recebem `tenant_id`; tabelas operacionais por unidade recebem `branch_id`.

## Entidades principais

- Plataforma: `tenants`, `plans`, `subscriptions`.
- Identidade: `users`, `roles`, `user_roles`, `invitations`.
- Operacao: `branches`, `floor_plans`, `dining_tables`, `tabs`, `orders`, `order_items`.
- Catalogo: `categories`, `products`, `modifier_groups`, `modifier_options`.
- Estoque: `inventory_items`, `stock_locations`, `recipes`, `recipe_items`, `stock_movements`.
- Financeiro: `payments`, `cash_sessions`.
- Producao: `kds_stations`, `kds_tickets`.
- Integracoes: `integration_accounts`, `webhook_events`, `outbox_events`.
- Fiscal: `fiscal_documents`.
- Compliance: `customers`, `audit_logs`.

## Concorrencia

- Fechamento de pedido e caixa deve usar transacao e lock no registro principal.
- Edicoes de pedido usam `version` para detectar escrita concorrente.
- Baixa de estoque e reversao de cancelamento geram movimentos, nunca editam historico.
