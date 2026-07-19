"use client";

import { Bell, ChefHat, Clock3, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type KdsTicket,
  listKdsStations,
  listKdsTickets,
  updateKdsTicket,
} from "../../../lib/giromesa-api";

const statusLabel: Record<string, string> = {
  sent: "Novo",
  preparing: "Em preparo",
  ready: "Pronto",
  served: "Entregue",
};

export default function KdsPage() {
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [station, setStation] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [message, setMessage] = useState("Carregando produção...");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  async function load() {
    try {
      const [ticketRows, stationRows] = await Promise.all([listKdsTickets(), listKdsStations()]);
      setTickets(ticketRows);
      setStations(stationRows.map((item) => ({ id: item.id, name: item.name })));
      setMessage(`${ticketRows.length} ticket(s) no fluxo de produção.`);
    } catch {
      setMessage("Entre com o perfil de cozinha ou bar para operar a produção.");
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: carregamento inicial do KDS.
  useEffect(() => {
    void load();
  }, []);
  const visible = useMemo(
    () =>
      tickets
        .filter((ticket) => station === "all" || ticket.stationName === station)
        .filter((ticket) =>
          statusFilter === "active" ? ticket.status !== "served" : ticket.status === statusFilter,
        )
        .sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0)),
    [station, statusFilter, tickets],
  );
  async function advance(ticket: KdsTicket) {
    const next =
      ticket.status === "sent" ? "preparing" : ticket.status === "preparing" ? "ready" : "served";
    const updated = await updateKdsTicket(ticket.id, next);
    setTickets((current) =>
      current.map((item) => (item.id === ticket.id ? { ...item, ...updated } : item)),
    );
    if (soundEnabled && next === "ready") window.navigator.vibrate?.(80);
  }
  return (
    <main className="kds-page">
      <header className="kds-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <div className="toolbar">
          <button
            className={soundEnabled ? "button primary compact" : "button secondary compact"}
            onClick={() => setSoundEnabled((value) => !value)}
            type="button"
          >
            <Bell size={16} /> Som
          </button>
          <button className="button secondary compact" onClick={() => void load()} type="button">
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </header>
      <section className="kds-header">
        <div>
          <span className="section-kicker">
            <ChefHat size={16} /> Produção
          </span>
          <h1>KDS</h1>
          <p>{message}</p>
        </div>
        <label>
          Estação
          <select value={station} onChange={(event) => setStation(event.target.value)}>
            <option value="all">Todas</option>
            {stations.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="active">Ativos</option>
            <option value="sent">Novos</option>
            <option value="preparing">Em preparo</option>
            <option value="ready">Prontos</option>
            <option value="served">Entregues</option>
          </select>
        </label>
      </section>
      <section className="kds-board">
        {visible.map((ticket) => (
          <article className={`kds-ticket kds-${ticket.status}`} key={ticket.id}>
            <div>
              <span>{ticket.stationName}</span>
              <strong>
                {ticket.orderChannel === "table" ? "Mesa" : "Pedido"} {ticket.orderId.slice(0, 5)}
              </strong>
              <small>
                <Clock3 size={14} /> {readAge(ticket.createdAt)}
              </small>
            </div>
            <p>{String(ticket.payload.summary ?? "Itens do pedido")}</p>
            <footer>
              <span>
                {statusLabel[ticket.status] ?? ticket.status}
                {ticket.priority ? ` · prioridade ${ticket.priority}` : ""}
              </span>
              <button
                className="button primary compact"
                type="button"
                onClick={() => void advance(ticket)}
              >
                {ticket.status === "sent"
                  ? "Iniciar"
                  : ticket.status === "preparing"
                    ? "Marcar pronto"
                    : "Entregar"}
              </button>
            </footer>
          </article>
        ))}
        {!visible.length ? (
          <p className="muted-copy">Nenhum ticket ativo para esta estação.</p>
        ) : null}
      </section>
    </main>
  );
}

function readAge(createdAt: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes <= 0) {
    return "agora";
  }
  return `${minutes} min`;
}
