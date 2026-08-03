# Ecossistema GiroMesa e Dose Club

O GiroMesa publica o catálogo comercial e os entitlements do ecossistema. Os produtos
continuam com aplicações, sessões, bancos e deploys independentes.

## Catálogo e entitlements

- `GET /api/v1/ecosystem/catalog` é público e retorna os produtos canônicos
  `giromesa`, `doseclub` e `bundle`.
- `GET /api/v1/ecosystem/entitlements` retorna os acessos efetivos do tenant autenticado.
- `PUT /api/v1/ecosystem/tenants/:tenantId/entitlements` exige `platform:manage` e
  concede ou revoga apenas códigos conhecidos.

Uma assinatura GiroMesa ativa ou em trial concede `giromesa.subscription`. Acesso ao
Dose Club exige `doseclub.subscription` ou `bundle`. `integration.shared_inventory` é
independente e não é inferido pelo nome do plano.

## Federação e handoff

Emissão autenticada:

```http
POST /api/v1/auth/federation/handoff
Content-Type: application/json

{"targetProduct":"doseclub","returnTo":"/clubs"}
```

O retorno contém `token`, `expiresAt` e `targetUrl` para
`https://doseclube.giromesa.com.br/login?federation_token=...`.

Troca servidor-servidor pelo Dose Club:

```http
POST /api/v1/auth/federation/exchange
x-product-integration-key: <segredo exclusivo do exchange>
Content-Type: application/json

{"token":"<handoff>"}
```

O token HMAC-SHA256 tem validade máxima de 60 segundos e leva somente `iss`, `aud`,
`sub`, `tenant_id`, `source_product`, `target_product`, `jti`, `iat`, `exp`,
`branch_id?` e `return_to?`. E-mail, nome, slug e entitlements atuais são resolvidos e
devolvidos somente na troca servidor-servidor. O `jti` é consumido atomicamente uma
vez no banco GiroMesa. O Dose Club cria sua própria sessão depois da troca; nenhum
cookie ou identificador de sessão GiroMesa é aceito pelo outro produto.

Variáveis:

```env
FEDERATION_ISSUER_URL=https://accounts.giromesa.com.br
FEDERATION_HANDOFF_SECRET=<segredo aleatório exclusivo, mínimo 32 caracteres>
DOSECLUB_PUBLIC_URL=https://doseclube.giromesa.com.br
DOSECLUB_SSO_EXCHANGE_KEY=<segredo servidor-servidor exclusivo, mínimo 32 caracteres>
```

Em produção, a federação retorna indisponível enquanto os segredos não estiverem
configurados; isso não bloqueia login, PDV, estoque, KDS nem o login nativo Dose Club.

## Campanhas e fidelidade

`/api/v1/ecosystem/campaigns` permite ao tenant criar campanhas opcionais entre os dois
produtos. O backend aceita somente destinos nos domínios oficiais e registra auditoria.
A tabela não contém cliente, saldo, carteira ou movimento de fidelidade: cada produto
mantém sua própria carteira e nenhuma campanha concede crédito ou entitlement.

## Resiliência

Emissão de handoff, catálogo, entitlements e campanhas usam somente o banco GiroMesa.
Não há chamada síncrona ao Dose Club no núcleo operacional. Se um produto estiver fora
do ar, o outro continua operando; apenas o redirecionamento federado ou a integração
explicitamente acionada fica temporariamente indisponível.
