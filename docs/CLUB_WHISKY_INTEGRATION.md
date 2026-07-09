# Integracao Dose Club

## Objetivo

Preparar o GiroMesa para integrar com a plataforma externa Dose Club sem fundir produtos, sem compartilhar banco de dados e sem transformar o Dose Club em modulo interno.

O GiroMesa permanece como fonte de verdade operacional do estabelecimento. O Dose Club fica responsavel pela experiencia e regras comerciais de clubes, saldos de doses, carteira do cliente final e compras online de clubes.

## Fontes de verdade

| Dado | Fonte de verdade | Observacao |
| --- | --- | --- |
| Tenant, filial e permissoes operacionais | GiroMesa | A integracao nunca envia `tenant_id`; o backend resolve pelo contexto autenticado. |
| Produtos e elegibilidade para Dose Club | GiroMesa | Produtos elegiveis usam `is_club_eligible`, `bottle_volume_ml`, `default_dose_ml` e `spirit_type`. |
| Estoque fisico | GiroMesa | Baixa real de estoque ocorre no GiroMesa por venda, ajuste, estorno ou movimento operacional permitido. |
| Dose Club, saldo de doses e experiencia do cliente | Dose Club | O Dose Club controla saldo contratado e historico visivel ao cliente. |
| Caixa e pagamento presencial | GiroMesa | Pagamentos presenciais continuam no PDV/caixa do GiroMesa. |
| Pagamento online de clubes | Dose Club | Pode usar Asaas proprio do Dose Club; GiroMesa recebe eventos operacionais idempotentes. |
| Auditoria operacional | Ambos | GiroMesa audita impactos em estoque/produto/cliente; Dose Club audita saldos e acoes no portal do cliente. |

## Schema preparado no GiroMesa

Produtos possuem campos especificos para elegibilidade:

- `is_club_eligible`: habilita o produto para consulta e venda via integracao.
- `bottle_volume_ml`: volume da garrafa em ml.
- `default_dose_ml`: dose padrao, inicialmente 50 ml.
- `spirit_type`: categoria operacional como `whisky`, `gin`, `vodka`, `rum` ou similar.

Todo dado operacional continua com `tenant_id` obrigatorio. Quando aplicavel, a filial usa `branch_id`.

## Provider e conta de integracao

O dominio declara a porta `ClubWhiskyProvider`, preparada para publicacao de eventos e validacao de vinculos de cliente.

O provider registrado em `integration_accounts` e:

- `provider`: `club_whisky`
- `status`: `disabled`, `active` ou outro estado operacional futuro.
- `apiKeyHash`: hash da chave usada pelo Dose Club para chamar a API do GiroMesa.
- `apiKeyLastFour`: ultimos caracteres para identificacao operacional.
- `config.webhookSecretRef`: referencia para `CLUB_WHISKY_WEBHOOK_SECRET`.
- `config.branchId`: unidade vinculada, quando a integracao for por filial.
- `config.scopes`: permissoes autorizadas, por exemplo `products:read`, `stock:read`, `club_sales:write`, `club_consumption:write` e `customers:link`.

A API key e retornada apenas uma vez no provisionamento ou rotacao via `POST /api/v1/integrations/club-whisky/configure`. O banco armazena somente hash e ultimos caracteres. Logs e payloads persistidos nao devem conter chaves.

## Endpoints preparados

Base interna versionavel no GiroMesa:

- `GET /api/v1/integrations/club-whisky/branches`
- `GET /api/v1/integrations/club-whisky/products`
- `GET /api/v1/integrations/club-whisky/stock?branchId=...`
- `POST /api/v1/integrations/club-whisky/sales`
- `POST /api/v1/integrations/club-whisky/dose-consumptions`
- `POST /api/v1/integrations/club-whisky/customer-links`
- `POST /api/v1/integrations/club-whisky/configure`

Observacao de roteamento: a aplicacao Nest atual usa prefixo global `api/v1`.

### Regras de seguranca dos endpoints

- O tenant e resolvido no backend pelo contexto autenticado.
- Corpos contendo `tenantId` ou `tenant_id` sao rejeitados.
- Endpoints de consumo externo exigem header `x-giromesa-integration-key`.
- A API key resolve `tenant_id`, `branch_id` autorizado e scopes no backend.
- `POST /api/v1/integrations/club-whisky/configure` exige sessao GiroMesa com `tenant:manage`.
- Operacoes sensiveis geram auditoria append-only.
- Operacoes de escrita usam `idempotencyKey`.

## Webhook receiver

Endpoint preparado:

- `POST /webhooks/club-whisky`

Headers esperados:

- `x-club-whisky-signature`: assinatura HMAC em formato `sha256=<hex>`.
- `x-club-whisky-timestamp`: timestamp usado na assinatura.
- `x-webhook-id` ou `x-event-id`: id unico do evento.

Assinatura:

```text
HMAC_SHA256(secret, timestamp + "." + eventId + "." + rawBody)
```

O GiroMesa rejeita assinaturas invalidas e timestamps fora da tolerancia configurada no helper de verificacao. A aplicacao Nest/Fastify esta configurada com `rawBody: true` para evitar divergencia de serializacao entre plataformas.

Eventos recebidos sao registrados em `webhook_events` com idempotencia por `provider + external_event_id` e processados de forma preparada para fila/outbox.

## Eventos de saida

Eventos preparados para `outbox_events`:

- `product.updated`
- `stock.updated`
- `order.closed`
- `payment.confirmed`
- `customer.updated`
- `club.stock_movement.created`

O worker futuro deve publicar esses eventos para o Dose Club quando a conta `club_whisky` estiver ativa e autorizada.

## Movimentos de estoque

Tipos preparados:

- `club_bottle_sale`
- `club_combo_sale`
- `club_dose_consumed`
- `club_adjustment`
- `club_refund`

Regra critica: evitar baixa dupla.

Na venda de garrafa/clube, o GiroMesa pode baixar o estoque fisico com base na ficha tecnica do produto elegivel. No consumo posterior de dose, o GiroMesa registra um movimento operacional `club_dose_consumed` com efeito zero em quantidade fisica, porque a garrafa ja foi baixada na venda do Dose Club.

## Fluxos

### Venda presencial no GiroMesa

1. Operador vende produto elegivel no PDV.
2. GiroMesa fecha pedido/pagamento no caixa.
3. GiroMesa baixa estoque fisico conforme receita/ficha tecnica.
4. GiroMesa cria eventos `order.closed`, `payment.confirmed`, `stock.updated` e, quando aplicavel, `club.stock_movement.created`.
5. Dose Club recebe evento e cria/atualiza saldo de doses do cliente vinculado.

### Compra online no Dose Club

1. Cliente compra um clube no ambiente do Dose Club.
2. Dose Club confirma pagamento online.
3. Dose Club chama `POST /api/v1/integrations/club-whisky/sales` com `idempotencyKey`.
4. GiroMesa valida contexto, permissao, produto elegivel e filial.
5. GiroMesa registra movimento `club_bottle_sale`, baixa estoque fisico se houver ficha tecnica e audita a operacao.

### Consumo posterior de dose

1. Cliente consome dose no estabelecimento.
2. Dose Club chama `POST /api/v1/integrations/club-whisky/dose-consumptions`.
3. GiroMesa registra `club_dose_consumed` com quantidade zero para nao baixar estoque duas vezes.
4. GiroMesa audita a operacao e publica `club.stock_movement.created`.

### Ajuste ou estorno

1. Operador autorizado faz ajuste/estorno no sistema responsavel pelo saldo.
2. GiroMesa deve receber ou emitir evento idempotente conforme a origem.
3. Se houver impacto fisico real, usar `club_adjustment` ou `club_refund` com movimento reverso claro.
4. Toda alteracao deve ser auditavel, sem edicao destrutiva do historico.

## Variaveis de ambiente

```env
CLUB_WHISKY_API_BASE_URL=https://club.example.com
CLUB_WHISKY_API_KEY=replace-with-club-api-key
CLUB_WHISKY_WEBHOOK_SECRET=replace-with-club-webhook-secret
```

`CLUB_WHISKY_API_KEY` e reservado para chamadas de saida do GiroMesa para o Dose Club. A chave usada pelo Dose Club para chamar o GiroMesa e gerada por tenant/filial e armazenada como hash em `integration_accounts`.

## Testes obrigatorios

- Isolamento multi-tenant.
- Rejeicao de `tenant_id` vindo da integracao.
- Idempotencia por evento/chave externa.
- Rejeicao de webhook com assinatura invalida.
- Movimento `club_dose_consumed` sem baixa dupla de estoque.

## Riscos e decisoes pendentes

- Definir modelo de identidade entre cliente GiroMesa e cliente Dose Club: vinculo manual, telefone validado, CPF, e-mail ou conta federada.
- Definir se compra online no Dose Club sempre baixa estoque no momento da compra ou se pode reservar estoque ate retirada/abertura da garrafa.
- Definir tratamento de combos com multiplos rotulos: baixa proporcional, escolha livre por dose ou carteira separada por produto.
- Definir politica de retry, assinatura e expiracao de eventos de saida.
- Definir painel operacional para reconciliar divergencias entre saldo do Dose Club e estoque fisico do GiroMesa.
