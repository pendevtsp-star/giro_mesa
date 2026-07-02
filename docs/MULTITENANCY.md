# Multi-tenancy

## Estrategia MVP

Banco compartilhado com `tenant_id` obrigatorio. O tenant e resolvido pelo backend a partir de sessao, dominio/subdominio, convite ou contexto administrativo auditado.

## Regras

- Frontend nunca escolhe livremente o `tenant_id`.
- Repositorios e services recebem `TenantContext`.
- Toda query privada filtra por `tenant_id`.
- `branch_id` deve ser validado contra o tenant.
- Backoffice plataforma usa permissoes separadas.
- Impersonation de suporte exige justificativa, tempo limitado e auditoria.

## Defesa adicional

Ativar Row Level Security nas tabelas criticas quando as migrations iniciais estabilizarem. Testes cross-tenant sao obrigatorios para auth, catalogo, pedidos, pagamentos, estoque e relatorios.
