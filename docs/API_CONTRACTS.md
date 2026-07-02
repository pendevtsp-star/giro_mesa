# Contratos de API

## Rotas iniciais

- `GET /health`
- `POST /api/v1/tenants`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/invitations`
- `GET /api/v1/catalog/products`
- `POST /api/v1/catalog/categories`
- `POST /api/v1/catalog/products`
- `GET /api/v1/catalog/products/:productId/modifiers`
- `GET /api/v1/pos/tables?branchId=:branchId`
- `POST /api/v1/pos/orders/open`
- `POST /api/v1/pos/orders/:orderId/items`
- `POST /api/v1/pos/orders/:orderId/send-to-kitchen`
- `POST /api/v1/pos/orders/:orderId/split`
- `POST /api/v1/pos/orders/:orderId/payments`
- `POST /api/v1/pos/orders/:orderId/close`
- `POST /api/v1/pos/cash-sessions/open`
- `POST /api/v1/pos/cash-sessions/:cashSessionId/close`
- `GET /api/v1/kds/tickets`
- `PATCH /api/v1/kds/tickets/:ticketId`
- `POST /webhooks/asaas`
- `POST /webhooks/meta`
- `POST /webhooks/ifood`

## Padroes

- JSON.
- `x-request-id` aceito e propagado.
- Tenant resolvido por sessao/dominio; headers demo so existem no scaffold local.
- Erros devem seguir envelope padrao antes do beta.
