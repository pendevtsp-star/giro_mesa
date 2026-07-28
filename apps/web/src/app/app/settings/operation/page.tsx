"use client";

import { ArrowLeft, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApprovalPinDialog } from "../../../../features/approvals/ApprovalPinDialog";
import {
  type ApprovalRequest,
  decideApprovalRequest,
  formatMoney,
  getOperationPolicy,
  listApprovalRequests,
  type OperationPolicy,
  updateOperationPolicy,
} from "../../../../lib/giromesa-api";

type Decision = { approval: ApprovalRequest; kind: "approve" | "reject" } | null;

export default function OperationSettingsPage() {
  const [policy, setPolicy] = useState<OperationPolicy | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [discountPercent, setDiscountPercent] = useState("10");
  const [managerPin, setManagerPin] = useState("");
  const [decision, setDecision] = useState<Decision>(null);
  const [message, setMessage] = useState("Carregando regras operacionais...");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextPolicy, nextApprovals] = await Promise.all([
      getOperationPolicy(),
      listApprovalRequests(),
    ]);
    setPolicy(nextPolicy);
    setDiscountPercent(String(nextPolicy.maxDiscountWithoutApprovalBps / 100));
    setApprovals(nextApprovals);
    setMessage(
      nextApprovals.length > 0
        ? `${nextApprovals.length} solicitação(ões) aguardando decisão.`
        : "Política ativa. Nenhuma aprovação pendente.",
    );
  }, []);

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Falha ao carregar regras."),
    );
  }, [load]);

  async function savePolicy() {
    if (!policy) return;
    setBusy(true);
    try {
      const updated = await updateOperationPolicy({
        maxDiscountWithoutApprovalBps: Math.round(Number(discountPercent) * 100),
        requireCancellationReason: policy.requireCancellationReason,
        requireApprovalAfterKitchen: policy.requireApprovalAfterKitchen,
        returnStockOnApprovedCancellation: policy.returnStockOnApprovedCancellation,
        ...(managerPin ? { managerPin } : {}),
      });
      setPolicy(updated);
      setManagerPin("");
      setMessage("Política operacional salva e auditada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar política.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDecision(pin: string, reason: string) {
    if (!decision) return;
    setBusy(true);
    setDialogError(null);
    try {
      await decideApprovalRequest(decision.approval.id, decision.kind, {
        managerPin: pin,
        ...(reason ? { reason } : {}),
      });
      setDecision(null);
      await load();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Não foi possível validar o PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page operation-settings-page">
      <header className="workspace-topbar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </header>

      <section className="workspace-heading">
        <span className="section-kicker">
          <ShieldCheck size={16} /> Controle operacional
        </span>
        <h1>Políticas e aprovações</h1>
        <p>{message}</p>
      </section>

      <section className="operation-settings-grid">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Política efetiva</span>
              <h2>Limites do turno</h2>
            </div>
          </div>
          {policy ? (
            <div className="settings-form">
              <label>
                Desconto sem aprovação (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercent}
                  onChange={(event) => setDiscountPercent(event.target.value)}
                />
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={policy.requireCancellationReason}
                  onChange={(event) =>
                    setPolicy({ ...policy, requireCancellationReason: event.target.checked })
                  }
                />
                Exigir motivo no cancelamento
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={policy.requireApprovalAfterKitchen}
                  onChange={(event) =>
                    setPolicy({ ...policy, requireApprovalAfterKitchen: event.target.checked })
                  }
                />
                Exigir aprovação após envio à cozinha
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={policy.returnStockOnApprovedCancellation}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      returnStockOnApprovedCancellation: event.target.checked,
                    })
                  }
                />
                Estornar estoque em cancelamento aprovado
              </label>
              <label>
                Novo PIN gerencial
                <input
                  type="password"
                  inputMode="numeric"
                  minLength={4}
                  maxLength={12}
                  placeholder="Deixe vazio para manter"
                  value={managerPin}
                  onChange={(event) => setManagerPin(event.target.value.replace(/\D/g, ""))}
                />
              </label>
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => void savePolicy()}
              >
                Salvar política
              </button>
            </div>
          ) : (
            <p className="muted-copy">Nenhuma política configurada para este perfil.</p>
          )}
        </article>

        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Fila gerencial</span>
              <h2>Aguardando aprovação</h2>
            </div>
            <span className="count-chip">{approvals.length}</span>
          </div>
          <div className="approval-list">
            {approvals.map((approval) => (
              <div className="approval-card" key={approval.id}>
                <div>
                  <strong>
                    {approval.action === "order.discount"
                      ? "Desconto no pedido"
                      : "Cancelamento de item"}
                  </strong>
                  <p>{approval.reason ?? "Sem motivo informado"}</p>
                  <small>
                    {approval.requestedValueCents
                      ? formatMoney(approval.requestedValueCents)
                      : `Pedido ${String(approval.metadata.orderId ?? approval.entityId).slice(0, 8)}`}
                  </small>
                </div>
                <div className="toolbar">
                  <button
                    className="button ghost compact"
                    type="button"
                    onClick={() => setDecision({ approval, kind: "reject" })}
                  >
                    <XCircle size={15} /> Rejeitar
                  </button>
                  <button
                    className="button primary compact"
                    type="button"
                    onClick={() => setDecision({ approval, kind: "approve" })}
                  >
                    <CheckCircle2 size={15} /> Aprovar
                  </button>
                </div>
              </div>
            ))}
            {approvals.length === 0 ? (
              <p className="muted-copy">Nenhuma solicitação pendente.</p>
            ) : null}
          </div>
        </article>
      </section>

      <ApprovalPinDialog
        open={Boolean(decision)}
        title={decision?.kind === "approve" ? "Aprovar solicitação" : "Rejeitar solicitação"}
        description="A decisão é auditada e o PIN não é armazenado nem exibido."
        confirmLabel={decision?.kind === "approve" ? "Aprovar agora" : "Rejeitar agora"}
        busy={busy}
        error={dialogError}
        onClose={() => {
          setDecision(null);
          setDialogError(null);
        }}
        onConfirm={confirmDecision}
      />
    </main>
  );
}
