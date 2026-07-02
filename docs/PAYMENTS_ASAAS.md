# Pagamentos Asaas

## Contextos

1. Assinatura SaaS B2B do estabelecimento para a plataforma.
2. Pagamento B2C opcional do cliente final para o estabelecimento.
3. Split/marketplace futuro, dependente de validacao juridica e financeira.

## MVP

- Assinatura por checkout hospedado Asaas, inicialmente mock/sandbox.
- Webhooks de cobranca processados por fila.
- Tenant muda entre `trial`, `active`, `past_due`, `suspended` e `canceled`.
- Vendas presenciais usam registro manual de forma de pagamento.

## Regras

- Nao armazenar cartao ou CVV.
- Usar idempotencia para webhooks e criacao de cobranças.
- Validar webhook secret.
- Logs sem dados sensiveis.
- Rotina de reconciliacao.

## Referencias

- https://docs.asaas.com/docs/asaas-checkout
- https://docs.asaas.com/docs/subscriptions
- https://docs.asaas.com/docs/webhooks-3
