# Prompt para executar no projeto Dose Club

Copie o bloco abaixo para a conversa Codex que esta aberta no repositorio Dose Club.

---

Voce esta trabalhando exclusivamente no repositorio **Dose Club / Clube do Whisky**.
Preserve todas as alteracoes locais existentes, nao altere o GiroMesa, nao compartilhe banco
de dados e nao faca commit, push ou deploy sem nova autorizacao.

## Contexto fechado com o projeto GiroMesa

Os produtos continuam independentes:

- cliente pode assinar somente GiroMesa, somente Dose Club ou o bundle;
- logins, paineis, APIs, bancos, workers e deploys permanecem separados;
- `doseclube.giromesa.com.br` hospeda o web/API do Dose Club;
- a integracao e opcional por tenant/filial;
- Dose Club e fonte de verdade de ofertas, combos, memberships, saldo de doses, beneficios
  e historico do cliente;
- GiroMesa e fonte de verdade do estoque fisico quando a integracao estiver ativa;
- no modo standalone, Dose Club continua sendo sua propria autoridade de estoque.

Nao existe reserva de uma garrafa especifica por cliente. O cliente possui saldo de doses.
No `combo_pool`, cada consumo escolhe um dos rotulos elegiveis e reduz o estoque fisico
desse rotulo. A compra do clube/combo nao reduz estoque.

O contrato GiroMesa esta versionado como `2026-07-30` em
`docs/CLUB_WHISKY_INTEGRATION.md` do outro repositorio. Implemente exatamente o contrato
abaixo.

## Endpoints corretos do GiroMesa

Use como base:

`{apiBaseUrl}/api/v1/integrations/club-whisky`

Envie somente:

`x-giromesa-integration-key: <segredo resolvido por secretRef>`

Remova as rotas antigas `/club/*`, o header `x-integration-client-id` e Bearer para essas
chamadas.

- `GET /branches`
- `GET /products`
- `GET /stock?branchId=...&productId=...`
- `POST /sales`
- `POST /dose-consumptions`
- `POST /dose-consumptions/reversals`
- `POST /customer-links`

Nunca envie `tenantId`/`tenant_id`; GiroMesa resolve tenant e filial pela chave.

## Alteracoes obrigatorias no dominio Dose Club

1. Separe explicitamente `inventoryMode = standalone | giromesa`.
2. Migre o ledger fisico standalone para mililitros. Nao use `quantityUnits` para misturar
   garrafas e doses.
3. Mantenha `membership.remainingDoses` como saldo comercial de doses.
4. Venda individual ou `combo_pool` cria/ativa membership e ledger comercial, mas nao
   movimenta estoque.
5. Consumo individual exige o rotulo da membership; consumo combo exige `productVersionId`
   pertencente ao conjunto da oferta.
6. Resolva `productVersionId -> giromesa productId` por `integration_mappings` do tenant.
7. Em modo integrado, implemente saga:
   - validar saldo, rotulo e permissao;
   - criar transacao `pending_stock` com idempotency key persistida;
   - chamar `POST /dose-consumptions`;
   - somente em 2xx reduzir `remainingDoses` e finalizar ledger;
   - em timeout/5xx manter estado recuperavel e retry com a mesma chave;
   - em `409 insufficient_stock`, nao reduzir saldo e exibir falta de estoque;
   - nunca fazer baixa local silenciosa como fallback.
8. Estorno integrado chama `/dose-consumptions/reversals` antes de confirmar a compensacao
   local. Preserve `originalIdempotencyKey`.
9. Garanta um unico estorno por consumo e idempotencia para venda, consumo e estorno.
10. Corrija concorrencia: dois consumos simultaneos nao podem gastar o mesmo saldo.

## Payloads

Venda combo:

```json
{
  "branchId": "<mapping da unidade>",
  "saleType": "combo_pool",
  "eligibleProductIds": ["<produto Giro A>", "<produto Giro B>"],
  "quantityBottles": 1,
  "totalDoses": 20,
  "doseMl": 50,
  "externalClubId": "<membership id>",
  "externalOfferId": "<offer id>",
  "externalCustomerId": "<customer id opcional>",
  "idempotencyKey": "sale:<order id>"
}
```

Consumo:

```json
{
  "branchId": "<mapping da unidade>",
  "productId": "<rotulo real servido no GiroMesa>",
  "externalClubId": "<membership id>",
  "externalOfferId": "<offer id>",
  "offerType": "individual|combo_pool",
  "externalConsumptionId": "<consumption id>",
  "doseMl": 50,
  "employeeRef": "<employee id>",
  "idempotencyKey": "consumption:<consumption id>"
}
```

Estorno:

```json
{
  "branchId": "<mapping da unidade>",
  "productId": "<produto GiroMesa>",
  "externalClubId": "<membership id>",
  "externalConsumptionId": "<consumption id>",
  "externalReversalId": "<reversal id>",
  "originalIdempotencyKey": "consumption:<consumption id>",
  "doseMl": 50,
  "reason": "<motivo auditavel>",
  "idempotencyKey": "reversal:<reversal id>"
}
```

## Webhook recebido do GiroMesa

Mantenha `POST /v1/webhooks/giromesa`.

Valide:

- `x-giromesa-client-id`;
- `x-giromesa-event-id`;
- `x-giromesa-signature = sha256=<HMAC SHA-256 do raw body>`.

Envelope:

```json
{
  "id": "uuid",
  "event": "stock.updated",
  "source": "giromesa",
  "occurredAt": "ISO-8601",
  "data": {}
}
```

O tenant e resolvido pelo `clientId`, nunca pelo payload. O worker atual que apenas marca o
webhook como processado deve aplicar handlers reais e idempotentes para:

- `product.updated`;
- `stock.updated`;
- `order.closed`;
- `payment.confirmed`;
- `customer.updated`;
- `club.sale.registered`;
- `club.stock_movement.created`.

Eventos desconhecidos devem ser preservados como ignorados/nao suportados, sem falhar a fila
indefinidamente.

## Pareamento e assinatura

Implemente um wizard administrativo que:

- cria/edita a conta GiroMesa;
- recebe `apiBaseUrl`, `clientId`, `secretRef`, `webhookSecretRef`;
- testa `GET /branches`;
- permite mapear tenant, filial, clientes e produtos;
- mostra modo standalone/integrado, ultima sincronizacao e erro;
- nunca mostra o segredo depois de salvo;
- desativa integracao sem cancelar a assinatura independente do Dose Club.

Entitlements devem aceitar:

- Dose Club avulso;
- GiroMesa avulso;
- bundle;
- capability separada `integration.shared_inventory`.

Nao acople acesso ao Dose Club a um plano fixo do GiroMesa.

## Infraestrutura

- mantenha Compose, banco e Redis do Dose Club separados;
- nao publique Postgres/Redis em porta externa de producao;
- prepare imagens GHCR e GitHub Actions proprios do Dose Club;
- roteie `doseclube.giromesa.com.br` via Cloudflare Tunnel/Caddy:
  - `/v1/*` para API Dose Club;
  - demais caminhos para web Dose Club;
- segredos ficam no GitHub/VPS/secret manager, nunca no repositorio;
- nao altere DNS/Cloudflare/VPS nem faca deploy nesta etapa.

## Testes de aceite obrigatorios

- individual e combo sem baixa na compra;
- combo alterna rotulos e baixa o rotulo escolhido;
- saldo insuficiente e estoque insuficiente;
- timeout do GiroMesa sem perda de saldo;
- retry idempotente;
- dois consumos concorrentes;
- estorno unico;
- produto/filial/tenant sem mapping;
- isolamento multitenant;
- standalone funciona sem GiroMesa;
- integrado nao usa estoque local como fallback;
- assinatura HMAC valida/invalida;
- worker aplica evento e ignora duplicado;
- lint, typecheck, unitarios, integracao PostgreSQL, build e E2E relevante.

Ao terminar, entregue: arquivos e migrations, contrato implementado, testes executados,
riscos, rollback e o que ainda depende do GiroMesa. Nao declare a integracao pronta se o
fluxo real de consumo ainda nao chamar o provider.

---
