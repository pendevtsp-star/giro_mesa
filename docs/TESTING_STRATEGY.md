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

## Seguranca e concorrencia

- Acesso entre tenants.
- RBAC.
- CSRF/rate limit.
- Dois pagamentos na mesma conta.
- Dois fechamentos simultaneos.
- Webhook duplicado.
- Logs sem segredos.
