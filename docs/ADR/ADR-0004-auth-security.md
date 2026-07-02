# ADR-0004 - Auth e Seguranca

## Decisao

Usar sessoes seguras com cookies, Argon2id, MFA para perfis sensiveis, RBAC backend e auditoria append-only.

## Motivo

PDV, pagamentos, fiscal e dados pessoais exigem controle forte e rastreabilidade.

## Consequencias

Frontend nao e fonte de autorizacao. Permissoes sensiveis devem ser testadas no backend.
