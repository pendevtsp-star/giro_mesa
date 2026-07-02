# Observabilidade

## Logs

Logs estruturados com `request_id`, `tenant_id`, `branch_id`, `user_id`, rota, status, latencia e erro sanitizado.

## Metricas

- Erros 5xx.
- Latencia por endpoint.
- Fila parada.
- Webhook falhando.
- Pagamento com erro.
- Fiscal rejeitado/erro.
- Estoque negativo.
- Caixa divergente.
- Login suspeito.
- Bloqueio cross-tenant.

## Alertas

Enviar alerta para incidentes de pagamento, fiscal, fila, backup, erro elevado e integracao indisponivel.

## Ferramentas

Sentry ou equivalente para erros; uptime externo; dashboard tecnico por ambiente.
