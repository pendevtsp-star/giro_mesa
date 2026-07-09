# Estrategia de Testes

## Unitarios

- Total de pedido.
- Desconto.
- Taxa de servico.
- Divisao de conta.
- State machines.
- Permissoes.
- Idempotencia.
- Ficha tecnica e baixa/reversao de estoque.

## Integracao

- Pedido completo.
- Pagamento manual e Asaas mock.
- Caixa.
- Relatorios com filtros de metodo, variancia e status de caixa.
- Estoque.
- Fiscal provider mock.
- Webhooks.
- WhatsApp/e-mail mock.
- Multi-tenant.

## E2E

- Login.
- Criar produto.
- Abrir mesa.
- Lancar pedido.
- KDS recebe pedido.
- Fechar conta.
- Pagamento misto.
- Fechar caixa.
- Cardapio QR.
- Revisao de waiter, reports, manual e security em navegador autenticado.

### Preflight recomendado

- `pnpm test:e2e:preflight`
- `pnpm demo:reset`
- `pnpm test:e2e:dev`

## Seguranca e concorrencia

- Acesso entre tenants.
- RBAC.
- CSRF/rate limit.
- Dois pagamentos na mesma conta.
- Dois fechamentos simultaneos.
- Webhook duplicado.
- Logs sem segredos.
