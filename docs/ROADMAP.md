# Roadmap

## Fase 0 - Fundacao

Monorepo, Docker, CI, docs, schema, API/web/worker scaffold e ADRs.

## Fase 1 - Plataforma segura

Auth real, tenant context, RBAC, auditoria, migrations, layout base e testes cross-tenant.

## Fase 2 - Operacao MVP

Catalogo, mesas, comandas, PDV, KDS, caixa, estoque/ficha tecnica, cardapio QR e relatorios basicos.

## Fase 3 - Onboarding operacional e turno

Onboarding persistente, readiness, turno por filial, caixa com suprimento/sangria, dashboard de prontidao e testes de contratos.

## Fase 4 - Comercializacao e integracoes

Assinatura Asaas completa, e-mail transacional real, backup/restore validado, observabilidade, hardening, fiscal real, WhatsApp real, iFood, pagamentos online, app nativo, offline parcial e hardware.

## Proxima rodada tecnica

1. Aplicar migrations em ambiente com PostgreSQL e rodar testes de integracao.
2. Rodar E2E real: onboarding, turno, caixa, suprimento, sangria, fechamento e auditoria.
3. Extrair `features/printing` e `features/inventory` do dashboard principal.
4. Criar E2E especifico para readiness, fechamento e bloqueio cross-tenant.
5. Fazer revisao visual responsiva de `/app/onboarding`, `/app/cash` e `/app`.
