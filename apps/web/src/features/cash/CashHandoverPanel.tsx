"use client";

import { HandCoins } from "lucide-react";
import { type CashSessionSummary, formatMoney } from "../../lib/giromesa-api";

export function CashHandoverPanel({
  payments,
  busy,
  onReceive,
}: {
  payments: CashSessionSummary["payments"] | undefined;
  busy: boolean;
  onReceive: (paymentId: string) => Promise<void> | void;
}) {
  const pending = payments?.pendingHandovers ?? [];
  return (
    <section className="workspace-panel cash-handover-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">
            <HandCoins size={15} /> Dinheiro em trânsito
          </span>
          <h2>Entregas de garçons</h2>
        </div>
        <span className="count-chip">{pending.length}</span>
      </div>
      <div className="cash-handover-totals">
        <div>
          <small>Aguardando conferência</small>
          <strong>{formatMoney(payments?.pendingAmountCents ?? 0)}</strong>
        </div>
        <div>
          <small>Recebido fisicamente</small>
          <strong>{formatMoney(payments?.receivedAmountCents ?? 0)}</strong>
        </div>
        <div>
          <small>Com divergência</small>
          <strong>{formatMoney(payments?.disputedAmountCents ?? 0)}</strong>
        </div>
      </div>
      <div className="floor-entry-list">
        {pending.map((handover) => (
          <div className="floor-entry" key={handover.id}>
            <div>
              <strong>{formatMoney(handover.amountCents)}</strong>
              <small>Registrado em {new Date(handover.createdAt).toLocaleString("pt-BR")}</small>
            </div>
            <button
              className="button primary compact"
              type="button"
              disabled={busy}
              onClick={() => void onReceive(handover.id)}
            >
              Conferir recebimento
            </button>
          </div>
        ))}
        {pending.length === 0 ? <p className="muted-copy">Nenhuma entrega pendente.</p> : null}
      </div>
    </section>
  );
}
