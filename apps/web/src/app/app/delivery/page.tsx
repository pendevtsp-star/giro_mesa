"use client";

import { Bike, CircleX, Clock3, RefreshCw, Truck } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  cancelDelivery,
  createDelivery,
  type DeliveryOrder,
  type DeliveryStatus,
  formatMoney,
  getSession,
  listDeliveries,
  updateDeliveryStatus,
} from "../../../lib/giromesa-api";

const statusLabels: Record<DeliveryStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready_for_pickup: "Pronto para retirada",
  out_for_delivery: "Em entrega",
  delivered: "Entregue",
  canceled: "Cancelado",
};

const nextStatus: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready_for_pickup",
  ready_for_pickup: "out_for_delivery",
  out_for_delivery: "delivered",
};

const initialForm = {
  orderId: "",
  channel: "own_app" as "own_app" | "phone",
  customerName: "",
  customerPhone: "",
  deliveryAddress: "",
  deliveryFee: "",
  estimatedMinutes: "45",
  notes: "",
};

export default function DeliveryPage() {
  const [branchId, setBranchId] = useState("");
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [filter, setFilter] = useState<DeliveryStatus | "all">("all");
  const [form, setForm] = useState(initialForm);
  const [cancelTarget, setCancelTarget] = useState<DeliveryOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Carregando entregas...");

  async function load(activeBranchId = branchId, activeFilter = filter) {
    if (!activeBranchId) return;
    try {
      const rows = await listDeliveries(
        activeBranchId,
        activeFilter === "all" ? undefined : activeFilter,
      );
      setDeliveries(rows);
      setMessage(
        rows.length
          ? `${rows.length} entrega(s) no filtro atual.`
          : "Nenhuma entrega neste estado.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar entregas.");
    }
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: inicializa a unidade da sessão.
  useEffect(() => {
    void getSession()
      .then(async (session) => {
        if (!session.branchId) throw new Error("Unidade não encontrada.");
        setBranchId(session.branchId);
        await load(session.branchId, "all");
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Acesso ao delivery não autorizado."),
      );
  }, []);

  const metrics = useMemo(
    () => ({
      active: deliveries.filter((item) => !["delivered", "canceled"].includes(item.status)).length,
      delayed: deliveries.filter(
        (item) =>
          item.estimatedMinutes &&
          Date.now() - new Date(item.createdAt).getTime() > item.estimatedMinutes * 60_000 &&
          !["delivered", "canceled"].includes(item.status),
      ).length,
      ready: deliveries.filter((item) => item.status === "ready_for_pickup").length,
    }),
    [deliveries],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.orderId.trim() || !form.deliveryAddress.trim()) {
      setMessage("Informe o pedido e o endereço de entrega.");
      return;
    }
    void run(async () => {
      await createDelivery({
        orderId: form.orderId.trim(),
        channel: form.channel,
        ...(form.customerName.trim() ? { customerName: form.customerName.trim() } : {}),
        ...(form.customerPhone.trim() ? { customerPhone: form.customerPhone.trim() } : {}),
        deliveryAddress: form.deliveryAddress.trim(),
        ...(form.deliveryFee
          ? { deliveryFee: Math.round(Number(form.deliveryFee.replace(",", ".")) * 100) }
          : {}),
        ...(form.estimatedMinutes ? { estimatedMinutes: Number(form.estimatedMinutes) } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
      setForm(initialForm);
    }, "Entrega criada e auditada.");
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <button className="button secondary" type="button" onClick={() => void load()}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      <section className="workspace-heading">
        <span className="section-kicker">
          <Truck size={16} /> Operação própria
        </span>
        <h1>Delivery</h1>
        <p role="status">{message}</p>
      </section>

      <section className="inventory-metrics">
        <article>
          <Bike size={18} />
          <strong>{metrics.active}</strong>
          <span>em andamento</span>
        </article>
        <article>
          <Clock3 size={18} />
          <strong>{metrics.ready}</strong>
          <span>prontas para retirada</span>
        </article>
        <article>
          <CircleX size={18} />
          <strong>{metrics.delayed}</strong>
          <span>fora da estimativa</span>
        </article>
      </section>

      <section className="catalog-layout">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Novo fluxo</span>
              <h2>Criar entrega</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submit}>
            <label>
              ID do pedido
              <input
                required
                value={form.orderId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, orderId: event.target.value }))
                }
              />
            </label>
            <div className="workspace-form-grid">
              <label>
                Canal
                <select
                  value={form.channel}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      channel: event.target.value as "own_app" | "phone",
                    }))
                  }
                >
                  <option value="own_app">Delivery próprio</option>
                  <option value="phone">Telefone</option>
                  <option disabled>iFood — integração desativada</option>
                </select>
              </label>
              <label>
                Previsão (min)
                <input
                  inputMode="numeric"
                  value={form.estimatedMinutes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, estimatedMinutes: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="workspace-form-grid">
              <label>
                Cliente
                <input
                  value={form.customerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, customerName: event.target.value }))
                  }
                />
              </label>
              <label>
                Telefone
                <input
                  value={form.customerPhone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, customerPhone: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              Endereço
              <input
                required
                value={form.deliveryAddress}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryAddress: event.target.value }))
                }
              />
            </label>
            <div className="workspace-form-grid">
              <label>
                Taxa
                <input
                  inputMode="decimal"
                  value={form.deliveryFee}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, deliveryFee: event.target.value }))
                  }
                  placeholder="0,00"
                />
              </label>
              <label>
                Observações
                <input
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </div>
            <button className="button primary" disabled={busy} type="submit">
              Criar entrega
            </button>
          </form>
        </article>

        <article className="workspace-list-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Acompanhamento</span>
              <h2>Fila de entregas</h2>
            </div>
            <select
              aria-label="Filtrar entregas"
              value={filter}
              onChange={(event) => {
                const value = event.target.value as DeliveryStatus | "all";
                setFilter(value);
                void load(branchId, value);
              }}
            >
              <option value="all">Todos os estados</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {deliveries.map((delivery) => {
            const following = nextStatus[delivery.status];
            return (
              <div className="status-row rich" key={delivery.id}>
                <div>
                  <strong>
                    {delivery.customerName || `Pedido ${delivery.orderId.slice(0, 8)}`}
                  </strong>
                  <span>
                    {delivery.deliveryAddress || "Retirada"} · {formatMoney(delivery.totalCents)}
                  </span>
                </div>
                <span className="gm-badge gm-badge-info">{statusLabels[delivery.status]}</span>
                <div className="ticket-actions">
                  {following ? (
                    <button
                      className="button secondary compact"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await updateDeliveryStatus(delivery.id, following);
                        }, `Entrega atualizada para ${statusLabels[following]}.`)
                      }
                    >
                      Avançar
                    </button>
                  ) : null}
                  {!["delivered", "canceled"].includes(delivery.status) ? (
                    <button
                      className="button ghost compact"
                      disabled={busy}
                      type="button"
                      onClick={() => setCancelTarget(delivery)}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!deliveries.length ? <p className="muted-copy">Nenhuma entrega encontrada.</p> : null}
        </article>
      </section>

      {cancelTarget ? (
        <div
          className="modifier-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
        >
          <form
            className="modifier-dialog-content"
            onSubmit={(event) => {
              event.preventDefault();
              if (cancelReason.trim().length < 3) return;
              const target = cancelTarget;
              setCancelTarget(null);
              void run(async () => {
                await cancelDelivery(target.id, cancelReason.trim());
                setCancelReason("");
              }, "Entrega cancelada e auditada.");
            }}
          >
            <h2 id="cancel-title">Cancelar entrega</h2>
            <label>
              Motivo
              <input
                required
                minLength={3}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </label>
            <div className="modifier-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setCancelTarget(null)}
              >
                Voltar
              </button>
              <button className="button primary" type="submit">
                Confirmar cancelamento
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
