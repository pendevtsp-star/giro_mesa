# ADR-0003 - Pagamentos

## Decisao

Usar Asaas inicialmente para assinatura SaaS e pagamentos online opcionais. Pagamentos presenciais do MVP sao registros manuais.

## Motivo

Checkout hospedado reduz escopo PCI e acelera validacao comercial.

## Consequencias

Webhooks idempotentes, reconciliacao e bloqueio gradual por inadimplencia precisam existir antes de producao.
