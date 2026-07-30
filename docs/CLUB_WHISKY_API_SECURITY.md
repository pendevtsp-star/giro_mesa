# Padroes de seguranca da integracao GiroMesa + Dose Club

Contrato protegido: `2026-07-30`.

Este documento complementa `CLUB_WHISKY_INTEGRATION.md`. Os dois produtos permanecem
independentes, sem banco compartilhado e sem confiar em identificadores de tenant enviados
pelo cliente.

## Fronteiras de confianca

- GiroMesa e a autoridade do estoque fisico.
- Dose Club e a autoridade de ofertas, memberships e saldo comercial de doses.
- A chave de integracao resolve tenant, filial e scopes no backend.
- O `clientId` do webhook resolve o tenant no Dose Club.
- IDs externos nunca substituem filtros de `tenant_id` e `branch_id`.

## Autenticacao e autorizacao

- Requests Dose Club -> GiroMesa usam exclusivamente
  `x-giromesa-integration-key`.
- A chave possui 256 bits aleatorios, e retornada uma unica vez e armazenada somente como
  hash com os quatro ultimos caracteres para identificacao.
- Rotacao invalida imediatamente a chave anterior.
- Cada endpoint exige um scope especifico.
- Uma chave limitada a filial nao pode ler ou escrever outra filial.
- Endpoints administrativos exigem sessao e `tenant:manage`.
- Nenhum endpoint aceita `tenantId` ou `tenant_id` no payload.

## Validacao de entrada

- Payloads usam schemas Zod estritos, limites de tamanho e allowlists.
- Venda individual aceita `productId` e proibe `eligibleProductIds`.
- Combo aceita pelo menos dois `eligibleProductIds` distintos e proibe `productId`.
- Quantidades devem ser inteiras positivas e `doseMl` e limitado.
- Chaves de idempotencia possuem limite de tamanho e nao podem ser reutilizadas com
  payload diferente.
- Queries usam Drizzle parametrizado e sempre incluem tenant; operacoes por filial incluem
  branch.

## Idempotencia e concorrencia

- Venda, consumo e estorno reservam a idempotencia no PostgreSQL antes do efeito.
- Repeticao com o mesmo payload devolve sucesso duplicado sem novo movimento.
- Repeticao com payload diferente retorna conflito.
- Estoque e serializado por advisory lock transacional por tenant, filial e insumo.
- Estorno referencia e confere o consumo original; nao apaga historico.

## Webhook de saida

- O destino usa HTTPS em producao e allowlist de origem.
- O segredo HMAC e externo ao repositorio e pode usar referencia separada por tenant.
- A assinatura `sha256=<hex>` cobre o raw body completo.
- `eventId`, `contractVersion` e `correlationId` sao enviados em headers e envelope.
- O envelope nao contem tenant.
- O Dose Club valida assinatura antes de interpretar JSON e resolve tenant apenas pelo
  `clientId`.

## Entrega, retry e replay

- Alteracao de negocio e outbox sao gravados na mesma transacao.
- O worker possui timeout de 10 segundos.
- Somente falhas transitórias (`408`, `425`, `429`, `5xx`, timeout e rede) recebem retry.
- Backoff e exponencial, com jitter e teto de 15 minutos.
- Apos oito tentativas, o evento vai para `dead_letter`.
- Replay manual exige `tenant:manage`, so alcanca evento do tenant atual e gera auditoria
  append-only.
- O mesmo `eventId` e preservado em todos os retries e replays.

## Rate limit e consumo de recursos

- Endpoints da integracao possuem rate limit por hash da chave; a chave nao aparece na
  memoria de buckets, resposta ou logs.
- Webhooks possuem limite por cliente/IP.
- Arrays, strings, doses e IDs possuem limites no schema.
- A camada Cloudflare deve complementar o limite da aplicacao em producao.

## Segredos e logs

- Nunca registrar chave de integracao, segredo HMAC, assinatura ou raw body completo.
- Erros de outbox sao sanitizados e limitados a codigos operacionais.
- `.env.example` contem somente placeholders.
- Segredo comprometido exige rotacao coordenada nos dois produtos.

## Matriz minima de testes

- chave ausente, invalida, rotacionada e sem scope;
- tentativa de acesso cruzado a tenant e filial;
- campos desconhecidos e tentativa de enviar `tenantId`;
- payload individual/combo misturado;
- idempotencia igual e conflito de payload;
- dois consumos concorrentes com saldo insuficiente;
- webhook HMAC valido, invalido, corpo alterado e evento duplicado;
- URL nao permitida e HTTP em producao;
- `409` sem fallback local;
- `429`, `5xx`, timeout, retry, dead letter e replay;
- garantia de que respostas e logs nao contem segredos.

## Controles de infraestrutura

- TLS termina no Cloudflare/Caddy e o trafego interno fica restrito a rede Docker.
- PostgreSQL e Redis nao devem publicar portas publicas.
- Secrets entram por variaveis protegidas da VPS/GitHub, nunca por imagem ou repositorio.
- Staging usa tenant, chaves e bancos separados de producao.
- Alertas devem acompanhar crescimento de `dead_letter`, falha de HMAC e taxa de `401`,
  `403`, `409` e `429`.

## Pendencias antes de producao

- homologacao HTTP real entre os dois projetos;
- teste do Tunnel/Caddy e certificados;
- provisionamento das referencias de segredo por tenant;
- teste de indisponibilidade prolongada e replay operacional;
- revisao humana do plano de resposta a incidente e rotacao.
