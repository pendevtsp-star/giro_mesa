# Operacao Hibrida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Entregar operacao unica de balcao e salao com aprovacoes, caixa central, reservas, KDS e estoque consistentes.

**Architecture:** pos continua dono de pedido e pagamento. approvals isola politica de excecao. floor isola salao, reserva e fila. Kds, printing e inventory reagem somente a eventos aprovados. Web usa rotas por perfil e giromesa-api.ts como unico cliente HTTP.

**Tech Stack:** TypeScript, NestJS/Fastify, Drizzle/PostgreSQL, Next.js/React, Zod, Vitest, Playwright e pnpm/Turborepo.

## Global Constraints

- tenant_id resolvido pelo backend. Nenhum endpoint aceita tenantId livre.
- Mutations usam Zod, CSRF e RBAC backend.
- PIN, senha, token, cookie e comprovante sensivel nao entram em log/auditoria.
- Excecoes financeiras sao append-only.
- Nova migration Drizzle; nunca alterar migration aplicada.
- UI responsiva desktop, tablet e celular.
- Validacao final: lint, typecheck, unit, integration, E2E, build e security preflight.

## Arquivos-chave

- Dominio: packages/domain/src/enums.ts, packages/domain/src/state.ts e testes.
- Banco: packages/db/src/schema.ts, packages/db/drizzle/0012_hybrid_operations.sql, packages/db/src/seed.ts.
- Backend: criar apps/api/src/modules/approvals e apps/api/src/modules/floor; alterar pos, kds, printing, inventory, reports e app.module.ts.
- Web: criar features/approvals/ApprovalPinDialog.tsx, features/floor/FloorWorkspace.tsx, features/cash/CashHandoverPanel.tsx; alterar pos, waiter, cash, globals.css e giromesa-api.ts; criar rotas floor e settings/operation.
- Qualidade: criar tests/e2e/giromesa-hybrid-operations.spec.ts; atualizar API_CONTRACTS, OPERATIONS_RUNBOOK, CLIENT_MANUAL e PROJECT_MEMORY.

---

### Task 1: Estados, schema e migration

**Files:**
- Modify: packages/domain/src/enums.ts, packages/domain/src/state.ts, packages/domain/src/state.test.ts.
- Modify: packages/db/src/schema.ts, packages/db/src/schema.test.ts.
- Create: packages/db/drizzle/0012_hybrid_operations.sql.

**Interfaces:**
- ApprovalStatus: pending, approved, rejected, expired.
- CashHandoverStatus: not_required, pending, received, disputed.
- ReservationStatus: booked, arrived, seated, no_show, canceled.
- WaitlistStatus: waiting, notified, seated, left, canceled.
- Tabelas operation_policies, approval_requests, floor_areas, reservations, waitlist_entries e table_events.

- [ ] Step 1: Escrever testes: assertApprovalTransition pending/approved passa e approved/pending falha; assertCashHandoverTransition pending/received passa.
- [ ] Step 2: Rodar pnpm --filter @giromesa/domain test -- state.test.ts. Esperado: FAIL porque metodos nao existem.
- [ ] Step 3: Adicionar enums e state machines. Estados finais nao permitem retorno.
- [ ] Step 4: Estender payments com registered_by_user_id, registered_via, cash_handover_status, cash_handover_received_by_user_id e cash_handover_received_at.
- [ ] Step 5: Criar operation_policies com tenant, filial/role opcionais, limites de desconto, motivo obrigatorio, aprovacao apos envio e politica de baixa.
- [ ] Step 6: Criar approval_requests com entidade, acao, solicitante, aprovador, valores, motivo, status e metadata. Criar tabelas de salao com FKs e indices tenant/branch/status.
- [ ] Step 7: Rodar pnpm db:generate; pnpm --filter @giromesa/domain test; pnpm --filter @giromesa/db test. Esperado: PASS.
- [ ] Step 8: Commit: git add packages/domain packages/db; git commit -m "feat: add hybrid operation states and schema".

### Task 2: Politicas e aprovacao por PIN

**Files:**
- Create: apps/api/src/modules/approvals/approvals.module.ts, approvals.controller.ts, approvals.service.ts, approvals.controller.test.ts e approvals.integration.test.ts.
- Modify: apps/api/src/app.module.ts.

**Interfaces:**
- GET/PATCH /api/v1/operation/policies.
- GET /api/v1/approvals.
- POST /api/v1/approvals/:approvalId/approve.
- POST /api/v1/approvals/:approvalId/reject.
- ApprovalsService.createRequest(context, input).
- ApprovalsService.approve(context, approvalId, input).

- [ ] Step 1: Escrever testes: PIN invalido retorna Invalid manager approval; outro tenant nao localiza solicitacao; aprovacao grava approval.approved.
- [ ] Step 2: Rodar pnpm --filter @giromesa/api test -- approvals.controller.test.ts. Esperado: FAIL.
- [ ] Step 3: Criar Zod: policy recebe branchId/roleId opcionais, limites nao negativos e booleans; decision recebe managerPin 4-12 e reason 3-240 opcional.
- [ ] Step 4: Implementar politica efetiva na ordem role+branch, role, branch, tenant.
- [ ] Step 5: createRequest usa context.tenantId, cria pending e audita approval.requested.
- [ ] Step 6: approve exige approvals:manage, valida PIN contra hash, aplica state machine, audita e chama aplicador de dominio idempotente.
- [ ] Step 7: Rodar unit e integration. Esperado: PASS para PIN, isolamento, auditoria e segunda aprovacao.
- [ ] Step 8: Commit: git add apps/api/src/modules/approvals apps/api/src/app.module.ts; git commit -m "feat: add operational approvals with manager pin".

### Task 3: Desconto e cancelamento aprovado

**Files:**
- Modify: apps/api/src/modules/pos/pos.module.ts, pos.controller.ts, pos.service.ts, pos.controller.test.ts e pos.integration.test.ts.

**Interfaces:**
- POST /api/v1/pos/orders/:orderId/discounts.
- POST /api/v1/pos/orders/:orderId/items/:itemId/cancel-requests.
- PosService.applyApproval(context, approval).

- [ ] Step 1: Testar desconto dentro do limite altera total e cria order.discount_applied. Acima cria pending sem mudar total.
- [ ] Step 2: Testar item pending cancela direto; sent/preparing/ready/served cria solicitacao e conserva item ate aprovacao.
- [ ] Step 3: Rodar pnpm --filter @giromesa/api test -- pos.controller.test.ts pos.integration.test.ts. Esperado: FAIL.
- [ ] Step 4: Criar schemas desconto com amountCents inteiro positivo e reason 3-240; cancelamento com reason 3-240.
- [ ] Step 5: Implementar requestDiscount com politica efetiva e recalculo transacional.
- [ ] Step 6: Implementar requestItemCancellation e applyApproval. Aplicar uma vez, recalcular total, auditar e emitir evento derivado.
- [ ] Step 7: Rodar testes. Esperado: PASS incluindo repeticao sem efeito duplicado.
- [ ] Step 8: Commit: git add apps/api/src/modules/pos; git commit -m "feat: require approval for operational exceptions".

### Task 4: Pagamento pelo garcom e caixa central

**Files:**
- Modify: apps/api/src/modules/pos/pos.controller.ts, pos.service.ts e pos.integration.test.ts.
- Modify: apps/api/src/modules/reports/reports.service.ts.
- Modify: apps/web/src/lib/giromesa-api.ts e apps/web/src/lib/hooks/useCashSummary.ts.

**Interfaces:**
- registerManualPayment recebe registeredVia waiter ou cashier e reference opcional.
- POST /api/v1/pos/payments/:paymentId/cash-handover/receive.
- Cash summary inclui pendingCount, pendingAmountCents, receivedAmountCents e disputedAmountCents.

- [ ] Step 1: Testar cash de waiter como pending; caixa recebe e muda para received; segunda entrega nao duplica.
- [ ] Step 2: Testar PIX/cartao de waiter como not_required, mantendo autor e referencia.
- [ ] Step 3: Rodar pnpm --filter @giromesa/api test -- pos.integration.test.ts. Esperado: FAIL.
- [ ] Step 4: Registrar autor pelo contexto. Cash do garcom pending; cash do caixa received; demais meios not_required.
- [ ] Step 5: Implementar receiveCashHandover com cash:manage, mesma filial e auditoria cash_handover.received.
- [ ] Step 6: Atualizar summary/report. Cash pending nao entra como fisico conferido.
- [ ] Step 7: Rodar pos e reports. Esperado: PASS.
- [ ] Step 8: Commit: git add apps/api/src/modules/pos apps/api/src/modules/reports apps/web/src/lib; git commit -m "feat: add waiter payment cash handover".

### Task 5: Salao, reservas, fila e mesa

**Files:**
- Create: apps/api/src/modules/floor/floor.module.ts, floor.controller.ts, floor.service.ts, floor.controller.test.ts e floor.integration.test.ts.
- Modify: apps/api/src/app.module.ts e apps/api/src/modules/pos/pos.module.ts.

**Interfaces:**
- GET/POST/PATCH /api/v1/floor/areas.
- GET/POST/PATCH /api/v1/floor/reservations.
- GET/POST/PATCH /api/v1/floor/waitlist.
- POST /api/v1/floor/reservations/:id/seat.
- POST /api/v1/floor/tables/:id/transfer and release.

- [ ] Step 1: Testar reserva de quatro pessoas. seatReservation abre pedido table, marca reserva seated e mesa occupied em uma transacao.
- [ ] Step 2: Testar tenant externo, mesa bloqueada e capacidade insuficiente.
- [ ] Step 3: Rodar pnpm --filter @giromesa/api test -- floor.controller.test.ts floor.integration.test.ts. Esperado: FAIL.
- [ ] Step 4: Implementar reservas booked/arrived/seated/no_show/canceled e fila waiting/notified/seated/left/canceled.
- [ ] Step 5: Implementar areas, reservas e fila sempre filtradas por tenant/filial.
- [ ] Step 6: Implementar seatReservation com lock e transacao. Gravar table_events e abrir pedido channel table.
- [ ] Step 7: Implementar transferencia/liberacao como eventos auditados.
- [ ] Step 8: Rodar testes. Esperado: PASS.
- [ ] Step 9: Commit: git add apps/api/src/modules/floor apps/api/src/app.module.ts apps/api/src/modules/pos; git commit -m "feat: add floor reservations and waitlist".

### Task 6: KDS, impressao e estoque

**Files:**
- Modify: apps/api/src/modules/kds/kds.service.ts, printing/printing.service.ts, inventory/inventory.service.ts e pos/pos.service.ts.
- Modify: apps/api/src/modules/kds/kds.controller.test.ts e inventory/inventory.integration.test.ts.

**Interfaces:**
- handleOrderItemCanceled(context, input) em KDS, printing e inventory.
- Chave de estoque: order_item_reversal:ORDER_ITEM_ID.

- [ ] Step 1: Testar cancelamento aprovado de item enviado gera aviso KDS e job de impressao quando rota existe.
- [ ] Step 2: Testar duas aplicacoes deixam somente um movimento reverso.
- [ ] Step 3: Rodar pnpm --filter @giromesa/api test -- kds.controller.test.ts inventory.integration.test.ts. Esperado: FAIL.
- [ ] Step 4: KDS cria aviso somente com sentToKitchenAt. Printing respeita rota ativa.
- [ ] Step 5: Inventory reverte somente quando baixa original aconteceu e politica permite retorno.
- [ ] Step 6: Rodar KDS, inventory e pos. Esperado: PASS.
- [ ] Step 7: Commit: git add apps/api/src/modules/kds apps/api/src/modules/printing apps/api/src/modules/inventory apps/api/src/modules/pos; git commit -m "feat: propagate approved cancellations".

### Task 7: UX por perfil

**Files:**
- Create: apps/web/src/features/approvals/ApprovalPinDialog.tsx, features/floor/FloorWorkspace.tsx e features/cash/CashHandoverPanel.tsx.
- Modify: apps/web/src/features/pos/PosWorkspace.tsx, app/app/waiter/page.tsx, app/app/cash/page.tsx, lib/giromesa-api.ts e app/globals.css.
- Create: apps/web/src/app/app/floor/page.tsx e app/app/settings/operation/page.tsx.
- Test: apps/web/src/features/approvals/ApprovalPinDialog.test.tsx.

**Interfaces:**
- ApprovalPinDialog: open, onConfirm({ managerPin, reason? }), onClose.
- CashHandoverPanel: pagamentos pending e onReceive.
- FloorWorkspace: areas, tables, reservations, waitlist e comandos.

- [ ] Step 1: Testar dialog digita PIN, chama onConfirm e limpa estado ao fechar.
- [ ] Step 2: Rodar pnpm --filter @giromesa/web test -- ApprovalPinDialog.test.tsx. Esperado: FAIL.
- [ ] Step 3: Implementar dialog sem estado global. Mostrar solicitante, motivo e impacto sem dados sensiveis.
- [ ] Step 4: Atualizar POS/garcom: descontos/cancelamentos pending visiveis; cash recebido mostra aguardando caixa.
- [ ] Step 5: Atualizar caixa: lista pending com garcom, valor e horario; confirmar atualiza resumo.
- [ ] Step 6: Implementar floor responsivo. Arrastar muda somente layout; sentar reserva usa comando separado.
- [ ] Step 7: Implementar settings/operation para dono/gerente editar politicas.
- [ ] Step 8: Rodar pnpm --filter @giromesa/web test e pnpm --filter @giromesa/web typecheck. Esperado: PASS.
- [ ] Step 9: Commit: git add apps/web/src; git commit -m "feat: add hybrid operation workspaces".

### Task 8: Seed, E2E, docs e revisao visual

**Files:**
- Modify: packages/db/src/seed.ts.
- Create: tests/e2e/giromesa-hybrid-operations.spec.ts.
- Modify: docs/API_CONTRACTS.md, docs/OPERATIONS_RUNBOOK.md, docs/CLIENT_MANUAL.md e docs/PROJECT_MEMORY.md.

- [ ] Step 1: Seed cria setor Varanda, mesa V04, cliente com reserva, gerente e garcom. PIN demo usa hash no seed e nao entra em log.
- [ ] Step 2: Criar E2E: reserva chega/senta; garcom recebe cash; caixa confirma; desconto acima do limite pede PIN; gerente aprova; cancelamento chega KDS; outro tenant recebe 403.
- [ ] Step 3: Rodar pnpm demo:reset. Esperado: migration e seed sem erro.
- [ ] Step 4: Rodar pnpm lint; pnpm typecheck; pnpm test; pnpm test:integration; pnpm test:e2e:dev; pnpm build; pnpm security:preflight. Esperado: PASS.
- [ ] Step 5: Revisar 1440x900, 1024x768 e 390x844 em pos, waiter, floor e cash. Corrigir alvo menor que 44px, truncamento, contraste e sobreposicao.
- [ ] Step 6: Atualizar contratos, runbook e manual.
- [ ] Step 7: Commit: git add packages/db/src/seed.ts tests/e2e docs; git commit -m "test: cover hybrid restaurant operations".

## Revisao do plano

- Cobertura: pedido hibrido (3/7), caixa central (4/7), desconto/cancelamento/PIN (2/3/7), reservas/fila/mapa (5/7), KDS/impressao/estoque (6), seguranca/auditoria (1-6), E2E/UX (8).
- Fora de escopo: TEF, fiscal real, marketplace, offline completo e caixa individual por garcom.
- Ordem obrigatoria: Tasks 1, 2, 3, 4, 5, 6, 7, 8. Web inicia somente apos contratos backend correspondentes.
