# Arquitetura Frontend

Este documento registra a organização da UI interna do GiroMesa após a Fase 2.

## Objetivo

A UI interna deve evoluir por módulos, sem concentrar shell, fixtures, helpers, estados e fluxos operacionais em uma única rota. A rota pode orquestrar um fluxo, mas componentes, dados demonstrativos e formatações devem viver em camadas próprias.

## Estrutura Atual

- `apps/web/src/components/app-shell/`: shell autenticado/demo, navegação agrupada e configuração tipada de menu.
- `apps/web/src/components/states/`: estados reutilizáveis de loading, indisponibilidade, não autenticado, proibido e erro.
- `apps/web/src/features/dashboard/`: componentes e tipos do dashboard interno.
- `apps/web/src/lib/fixtures/`: dados demo controlados para fallback e demonstração.
- `apps/web/src/lib/formatters/`: helpers de leitura, labels e formatação de UI.
- `apps/web/src/lib/api/`: camada de compatibilidade para client API, erros e classificação de falhas.
- `apps/web/src/lib/hooks/`: hooks reutilizáveis, começando por sessão.
- `apps/web/src/styles/`: tokens, base, componentes compartilhados e app-shell.

## Regras

- Não criar autenticação fake no frontend.
- Não usar `tenantId` vindo do frontend como fonte de verdade.
- Preservar CSRF e sessão por cookie `HttpOnly`.
- Mocks/fixtures só podem aparecer em demo, desenvolvimento, testes ou fallback explícito.
- Componentes genéricos devem ir para `packages/ui` quando não dependerem de regra GiroMesa.
- Componentes específicos do produto ficam em `apps/web/src/features/*`.

## Próxima Extração Recomendada

O arquivo `apps/web/src/app/app/page.tsx` ainda contém fluxos operacionais grandes. A extração inicial do PDV já começou em `apps/web/src/features/pos/PosWorkspace.tsx`, com grade de produtos, prévia de comanda e seletor de modificadores.

As próximas extrações devem sair por domínio:

1. `features/printing/PrintingPanel.tsx`
2. `features/inventory/InventoryPanel.tsx`
3. `features/audit/AuditPanel.tsx`
4. `features/fiscal/FiscalPanel.tsx`
5. hooks por dominio para mover estados e efeitos: `usePrinting`, `useInventory`, `useAudit`, `useFiscal`.

Cada extração deve preservar os handlers atuais ou movê-los junto com testes de regressão.

## Ja extraido

- `features/pos/PosWorkspace.tsx`
- `features/catalog/CatalogManagementPanel.tsx`
- `features/floor/FloorMapPanel.tsx`
- `features/qr/QrOperationsPanel.tsx`
- `features/team/TeamAccessPanel.tsx`
- hooks operacionais: `useOnboardingStatus`, `useOperationalShift`, `useCashSummary`.
