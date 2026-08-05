"use client";

import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, getSession } from "../../../../lib/giromesa-api";

type Settlement = {
  id: string;
  status: string;
  netConsumptionCents: number;
  serviceReceivedCents: number;
  pendingCashCents: number;
  calculatedAt?: string;
  ledgerHash?: string;
  breakdown?: { orders?: Array<Record<string, unknown>> };
  version: number;
};
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);

export default function WaiterSettlementPage() {
  const [data, setData] = useState<Settlement[]>([]);
  const [message, setMessage] = useState("Carregando seu fechamento…");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const session = await getSession();
    const branchId = session.branchId ?? "";
    const current = branchId
      ? await apiRequest<{ shift: { id: string } | null }>(
          `/api/v1/pos/shift/current?branchId=${encodeURIComponent(branchId)}`,
        )
      : { shift: null };
    const result = current.shift
      ? await apiRequest<{ data: Settlement[] }>(
          `/api/v1/staff-finance/me/settlements?shiftId=${encodeURIComponent(current.shift.id)}`,
        )
      : { data: [] };
    setData(result.data);
    setMessage(current.shift ? "Confira os valores antes de confirmar." : "Nenhum turno aberto.");
  }, []);
  useEffect(() => {
    void refresh().catch(() => setMessage("Não foi possível carregar agora. Tente novamente."));
  }, [refresh]);
  const confirm = (item: Settlement) => {
    setBusy(true);
    void apiRequest(`/api/v1/staff-finance/settlements/${item.id}/confirm`, {
      method: "POST",
      body: { expectedVersion: item.version, idempotencyKey: crypto.randomUUID() },
    })
      .then(refresh)
      .then(() => setMessage("Fechamento confirmado com auditoria."))
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "Não foi possível confirmar."),
      )
      .finally(() => setBusy(false));
  };
  return (
    <main className="team-page staff-finance-page">
      <header className="team-page-header">
        <a className="button ghost compact" href="/app/waiter">
          <ArrowLeft size={16} /> Garçom
        </a>
        <div>
          <span className="section-kicker">Meu turno</span>
          <h1>Meu fechamento</h1>
          <p role="status">{message}</p>
        </div>
        <button
          type="button"
          className="button secondary compact"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>
      <aside className="staff-finance-notice">
        <CheckCircle2 size={18} />
        <p>
          Confira os valores. Esta tela é informativa e não realiza desconto salarial ou pagamento.
        </p>
      </aside>
      <section className="staff-finance-grid">
        <article className="panel">
          <h2>Resumo para conferência</h2>
          {data.length ? (
            <div className="team-list">
              {data.map((item) => (
                <div className="team-row" key={item.id}>
                  <div>
                    <strong>Vendas {money(item.netConsumptionCents)}</strong>
                    <span>Serviço recebido {money(item.serviceReceivedCents)}</span>
                  </div>
                  <div>
                    <strong>Dinheiro a entregar {money(item.pendingCashCents)}</strong>
                    <span>
                      {item.status === "awaiting_confirmation"
                        ? "Aguardando sua confirmação"
                        : "Confirmado"}
                    </span>
                  </div>
                  <details className="staff-finance-waiter-detail">
                    <summary>Ver conferência centavo a centavo</summary>
                    <p className="muted-copy">
                      Calculado em{" "}
                      {item.calculatedAt
                        ? new Date(item.calculatedAt).toLocaleString("pt-BR")
                        : "não informado"}
                      {item.ledgerHash ? ` · Hash ${item.ledgerHash.slice(0, 12)}` : ""}
                    </p>
                    {(item.breakdown?.orders ?? []).map((order, index) => (
                      <p key={String(order.orderId ?? index)}>
                        Comanda {String(order.orderId ?? "-").slice(0, 8)} · Líquido{" "}
                        {money(Number(order.netPaidCents ?? 0))} · Serviço{" "}
                        {money(Number(order.serviceReceivedCents ?? 0))}
                      </p>
                    ))}
                  </details>
                  {item.status === "awaiting_confirmation" ? (
                    <button
                      type="button"
                      className="button primary compact"
                      onClick={() => confirm(item)}
                      disabled={busy}
                    >
                      Confirmar valores
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">Seu fechamento ainda não foi calculado.</p>
          )}
        </article>
      </section>
    </main>
  );
}
