# ADR-0002 - Multi-tenancy

## Decisao

Usar banco compartilhado com `tenant_id` obrigatorio e RLS planejado.

## Motivo

Equilibra custo, simplicidade operacional e velocidade de MVP.

## Consequencias

Todo endpoint, query, job e relatorio precisa validar tenant. Testes cross-tenant sao obrigatorios.
