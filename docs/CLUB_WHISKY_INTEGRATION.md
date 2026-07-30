# Integracao GiroMesa + Dose Club

Contrato funcional: `2026-07-30`.

## Limites dos produtos

GiroMesa e Dose Club continuam sendo produtos, interfaces, APIs, bancos e assinaturas
independentes. Nenhum dos dois acessa o banco do outro.

Quando o estabelecimento possui os dois produtos e habilita a integracao:

- GiroMesa e a fonte de verdade do estoque fisico;
- Dose Club e a fonte de verdade de ofertas, combos, memberships, saldo de doses e
  historico do cliente;
- a compra de um clube ou combo nao movimenta estoque;
- cada dose servida informa o rotulo real e movimenta exatamente `doseMl` no GiroMesa;
- um combo pode alternar entre qualquer rotulo elegivel, sem reservar garrafa por cliente;
- estornos sao compensatorios e append-only.

Quando o estabelecimento possui somente Dose Club, ele permanece no modo de estoque
standalone do proprio produto.

## Modelo fisico no GiroMesa

Um produto elegivel deve possuir:

- `is_club_eligible = true`;
- `bottle_volume_ml`;
- `default_dose_ml`;
- `spirit_type`;
- uma unica ficha tecnica ligada a um unico insumo;
- insumo e item da ficha tecnica medidos em `ml`.

O saldo fisico e a soma append-only de `stock_movements`. Consumos concorrentes do mesmo
insumo/filial sao serializados por advisory lock transacional. Se `allow_negative = false`,
o GiroMesa rejeita consumo sem saldo com HTTP `409` e `error = insufficient_stock`.

## Autenticacao e isolamento

Dose Club chama o GiroMesa com:

```http
x-giromesa-integration-key: <chave retornada uma unica vez>
```

A chave resolve tenant, filial e scopes no backend. O cliente nunca envia `tenantId` ou
`tenant_id`; esses campos sao rejeitados. As chaves ficam armazenadas somente como hash.

Scopes:

- `branches:read`
- `products:read`
- `stock:read`
- `club_sales:write`
- `club_consumption:write`
- `club_consumption:reverse`
- `customers:link`

## Configuracao administrativa

`POST /api/v1/integrations/club-whisky/configure` exige sessao GiroMesa com
`tenant:manage`.

```json
{
  "branchId": "uuid-da-filial",
  "remoteClientId": "client-id-da-conta-giromesa-no-dose",
  "webhookUrl": "https://doseclube.giromesa.com.br/v1/webhooks/giromesa",
  "webhookSecretRef": "CLUB_WHISKY_WEBHOOK_SECRET_TENANT_A",
  "rotateKey": false
}
```

O retorno inclui `apiKey` somente na criacao ou rotacao. O segredo HMAC de webhook e
provisionado fora do repositorio. `webhookSecretRef` aceita apenas nomes com prefixo
`CLUB_WHISKY_WEBHOOK_SECRET`; quando omitido, usa `CLUB_WHISKY_WEBHOOK_SECRET`. Em
producao, prefira uma referencia diferente por tenant e configure o mesmo valor secreto
nos dois ambientes.

## Endpoints chamados pelo Dose Club

Base: `https://<host-giromesa>/api/v1/integrations/club-whisky`.

### Catalogo e estoque

- `GET /branches`
- `GET /products`
- `GET /stock?branchId=<uuid>&productId=<uuid opcional>`

`GET /stock` retorna o vinculo produto-insumo e `quantityMl`. Produtos sem ficha tecnica
aparecem sem item de estoque e nao aceitam consumo.

### Registrar venda comercial

`POST /sales`

Individual:

```json
{
  "branchId": "uuid",
  "saleType": "individual",
  "productId": "uuid",
  "quantityBottles": 1,
  "doseMl": 50,
  "externalClubId": "membership-id",
  "externalOfferId": "offer-id",
  "externalCustomerId": "customer-id",
  "idempotencyKey": "sale:order-id"
}
```

Combo:

```json
{
  "branchId": "uuid",
  "saleType": "combo_pool",
  "eligibleProductIds": ["uuid-rotulo-a", "uuid-rotulo-b"],
  "quantityBottles": 1,
  "totalDoses": 20,
  "doseMl": 50,
  "externalClubId": "membership-id",
  "externalOfferId": "combo-id",
  "externalCustomerId": "customer-id",
  "idempotencyKey": "sale:order-id"
}
```

A resposta confirma `stockMovementCreated = false` e `stockQuantityEffect = 0`.

### Consumir dose

`POST /dose-consumptions`

```json
{
  "branchId": "uuid",
  "productId": "uuid-do-rotulo-real-servido",
  "externalClubId": "membership-id",
  "externalOfferId": "offer-ou-combo-id",
  "offerType": "combo_pool",
  "externalConsumptionId": "consumption-id",
  "doseMl": 50,
  "employeeRef": "employee-id",
  "idempotencyKey": "consumption:consumption-id"
}
```

Sucesso retorna o insumo, efeito negativo e saldo fisico restante. O Dose Club so finaliza
a baixa do saldo de doses depois dessa confirmacao. Em indisponibilidade ou `409`, permanece
em `pending_stock`/falha recuperavel e nao reduz o saldo do cliente.

### Estornar dose

`POST /dose-consumptions/reversals`

```json
{
  "branchId": "uuid",
  "productId": "uuid",
  "externalClubId": "membership-id",
  "externalConsumptionId": "consumption-id",
  "externalReversalId": "reversal-id",
  "originalIdempotencyKey": "consumption:consumption-id",
  "doseMl": 50,
  "reason": "Lancamento duplicado",
  "idempotencyKey": "reversal:reversal-id"
}
```

O GiroMesa confere os dados contra o consumo original e permite apenas um estorno fisico
por `originalIdempotencyKey`.

### Vincular cliente

`POST /customer-links`

O vinculo e opcional para estoque, mas obrigatorio quando uma venda originada no PDV deve
ativar membership para um cliente do Dose Club.

## Webhooks GiroMesa para Dose Club

Destino padrao: `POST /v1/webhooks/giromesa`.

Headers:

```http
x-giromesa-client-id: <remoteClientId configurado>
x-giromesa-contract-version: 2026-07-30
x-giromesa-correlation-id: <requestId de origem ou eventId>
x-giromesa-event-id: <uuid do outbox>
x-giromesa-signature: sha256=<HMAC SHA-256 do raw body>
```

Envelope:

```json
{
  "id": "uuid",
  "event": "club.stock_movement.created",
  "source": "giromesa",
  "contractVersion": "2026-07-30",
  "correlationId": "request-ou-event-id",
  "occurredAt": "2026-07-30T00:00:00.000Z",
  "data": {}
}
```

O envelope nao envia `tenantId`. Dose Club resolve o tenant por `x-giromesa-client-id`.
Eventos usam outbox, idempotencia por event id, timeout de 10 segundos e retry
exponencial com jitter. Erros `408`, `425`, `429`, `5xx`, timeout e rede sao retentaveis.
Erros permanentes e eventos que excedem oito tentativas terminam em `dead_letter`.
Operadores com `tenant:manage` podem reenviar um evento do proprio tenant por
`POST /api/v1/integrations/outbox/:eventId/retry`; o replay e auditado.

Topicos:

- `product.updated`
- `stock.updated`
- `order.closed`
- `payment.confirmed`
- `customer.updated`
- `club.sale.registered`
- `club.stock_movement.created`

`product.updated` e criado na mesma transacao da criacao/alteracao de um produto
elegivel. O `data` inclui:

```json
{
  "contractVersion": "2026-07-30",
  "correlationId": "request-id",
  "reason": "created",
  "productId": "uuid",
  "name": "Whisky 1000ml",
  "priceCents": 42000,
  "isActive": true,
  "isAvailable": true,
  "isClubEligible": true,
  "bottleVolumeMl": 1000,
  "defaultDoseMl": 50,
  "spiritType": "whisky",
  "channels": ["pos"]
}
```

`stock.updated` e criado na mesma transacao de ajustes manuais, entrada, perda,
inventario, fechamento de pedido, cancelamento, consumo Dose Club e estorno. Apenas
produtos elegiveis ligados a exatamente um insumo em `ml` geram o evento:

```json
{
  "contractVersion": "2026-07-30",
  "correlationId": "request-id",
  "productId": "uuid",
  "branchId": "uuid",
  "inventoryItemId": "uuid",
  "availableMl": 850,
  "unit": "ml",
  "movementType": "sale",
  "movementId": "uuid-opcional",
  "changedAt": "2026-07-30T00:00:00.000Z"
}
```

## Ordem distribuida do consumo

1. Dose Club valida membership, combo, rotulo permitido e saldo de doses.
2. Dose Club cria operacao local `pending_stock` com idempotency key.
3. Dose Club chama o GiroMesa.
4. GiroMesa trava o insumo, valida saldo, grava movimento, auditoria e outbox na mesma
   transacao.
5. Dose Club confirma o ledger de doses somente depois do HTTP 2xx.
6. Retry repete a mesma idempotency key.
7. Estorno usa endpoint compensatorio; nenhum sistema apaga historico.

Nao existe transacao distribuida nem acesso cruzado a banco.

## Criterios de aceite conjunto

- compra individual e combo nao alteram estoque;
- dose individual e combo baixam o rotulo servido em ml;
- rotulos podem alternar dentro do mesmo combo;
- falta de estoque nao reduz saldo do cliente;
- requests simultaneos nao deixam estoque negativo;
- retry identico nao duplica movimento;
- mesma chave com payload diferente retorna `409`;
- estorno restaura ml uma unica vez;
- tenant/filial cruzados sao rejeitados;
- Dose-only e Giro-only continuam funcionando sem a integracao.

## Checklist antes de ativar uma filial

1. provisionar URLs HTTPS, chave de API, segredo de webhook e `remoteClientId` por ambiente;
2. rejeitar placeholders e reiniciar API/worker depois de qualquer rotacao de segredo;
3. restringir conta, escopos e filial; mapear apenas produtos elegiveis em `ml`;
4. testar venda sem baixa, consumo individual/combo, alternancia de rotulo e estorno;
5. testar idempotencia, payload divergente, estoque insuficiente, concorrencia e isolamento;
6. validar HMAC correto, HMAC incorreto, evento duplicado e processamento assincrono;
7. reenviar um `dead_letter` pelo endpoint administrativo e conferir o audit log;
8. executar migrations, lint, typecheck, testes, build, E2E aplicavel e `git diff --check`
   nos dois repositorios.

O repositorio guarda somente nomes de referencias de segredo. Valores reais devem existir no
gerenciador de segredos do ambiente e nunca em arquivos versionados.
