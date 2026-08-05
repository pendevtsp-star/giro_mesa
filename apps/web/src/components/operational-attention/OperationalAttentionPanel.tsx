"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { replayOperationalMutation } from "../../lib/giromesa-api";
import {
  createOperationalOutbox,
  OPERATIONAL_OUTBOX_CHANGED,
  type OperationalOutboxEntry,
  retryOperationalOutboxEntry,
} from "../../lib/operational-outbox";

type Props = {
  tenantId: string;
  branchId: string;
  onResolved?: (() => void | Promise<void>) | undefined;
};

const operationLabels: Record<string, string> = {
  open_order: "Abrir comanda",
  add_order_item: "Adicionar item",
  assign_customer: "Identificar cliente",
  register_payment: "Registrar pagamento",
  send_to_production: "Enviar para produção",
  close_order: "Fechar conta",
  request_discount: "Solicitar desconto",
  request_cancellation: "Cancelar item",
  request_waiter_help: "Solicitar ajuda",
  activate_table_qr: "Ativar QR da mesa",
  update_table: "Atualizar mesa",
  save_floor_plan: "Salvar mapa",
  merge_tables: "Unir mesas",
  unmerge_tables: "Separar mesas",
};

export function operationalEntryLabel(operation: string) {
  return operationLabels[operation] ?? "Operação do atendimento";
}

export function OperationalAttentionPanel({ tenantId, branchId, onResolved }: Props) {
  const outbox = useMemo(
    () => createOperationalOutbox({ tenantId, branchId }),
    [branchId, tenantId],
  );
  const [entries, setEntries] = useState<OperationalOutboxEntry[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const refresh = useCallback(async () => {
    const next = await outbox.list();
    setEntries(next.filter((entry: OperationalOutboxEntry) => entry.status !== "confirmed"));
  }, [outbox]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(OPERATIONAL_OUTBOX_CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(OPERATIONAL_OUTBOX_CHANGED, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  async function runEntryAction(idempotencyKey: string, action: () => Promise<unknown>) {
    setBusyKey(idempotencyKey);
    setFeedback("");
    try {
      await action();
      await refresh();
      await onResolved?.();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar a fila.");
      await refresh();
    } finally {
      setBusyKey(null);
    }
  }

  if (entries.length === 0) return null;

  return (
    <section className="operational-attention" aria-labelledby="operational-attention-title">
      <details open>
        <summary>
          <span className="operational-attention-heading">
            <AlertTriangle aria-hidden="true" size={18} />
            <span id="operational-attention-title">Conferência deste dispositivo</span>
          </span>
          <span className="operational-attention-count" aria-hidden="true">
            {entries.length}
          </span>
          <span className="sr-only">{entries.length} pendências</span>
        </summary>
        <p className="operational-attention-intro">
          Confira estas ações antes de repeti-las. A fila fica somente neste aparelho.
        </p>
        <ul className="operational-attention-list">
          {entries.map((entry) => {
            const busy = busyKey === entry.idempotencyKey;
            const needsCheck = entry.status === "requires_attention" || entry.replayable !== true;
            return (
              <li key={entry.idempotencyKey}>
                <div className="operational-attention-copy">
                  <strong>{operationalEntryLabel(entry.operation)}</strong>
                  <span>
                    {needsCheck ? "Confira no sistema antes de agir" : "Não concluída"}
                    {` · ${new Date(entry.updatedAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`}
                  </span>
                  {entry.error ? <small>{entry.error}</small> : null}
                </div>
                <div className="operational-attention-actions">
                  {entry.replayable === true ? (
                    <button
                      type="button"
                      disabled={busy || !window.navigator.onLine}
                      onClick={() =>
                        void runEntryAction(entry.idempotencyKey, () =>
                          retryOperationalOutboxEntry(
                            outbox,
                            entry.idempotencyKey,
                            replayOperationalMutation,
                          ),
                        )
                      }
                    >
                      <RefreshCw aria-hidden="true" size={15} />
                      Repetir
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Marque como resolvido somente depois de conferir a operação no sistema.",
                        )
                      )
                        return;
                      void runEntryAction(entry.idempotencyKey, () =>
                        outbox.resolveManually(entry.idempotencyKey),
                      );
                    }}
                  >
                    <CheckCircle2 aria-hidden="true" size={15} />
                    Resolvido
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Descartar remove apenas este registro local. A operação no servidor não será desfeita.",
                        )
                      )
                        return;
                      void runEntryAction(entry.idempotencyKey, () =>
                        outbox.discard(entry.idempotencyKey),
                      );
                    }}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                    Descartar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="operational-attention-feedback" aria-live="polite">
          {feedback}
        </p>
      </details>
    </section>
  );
}
