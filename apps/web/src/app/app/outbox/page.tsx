"use client";

import { Gauge, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  readOutboxPayloadSummary,
  readOutboxStatus,
  readOutboxTone,
  readRelativeTime,
} from "../../../lib/formatters/app-dashboard";
import { getSession, listOutboxEvents, type OutboxEvent } from "../../../lib/giromesa-api";

type OutboxStatusFilter = "all" | "pending" | "processed" | "failed";

export default function OutboxPage() {
  const [events, setEvents] = useState<OutboxEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState<OutboxStatusFilter>("all");
  const [message, setMessage] = useState("Carregando eventos de integração...");
  const [_busy, setBusy] = useState(false);

  const refresh = useCallback(async (filter: OutboxStatusFilter) => {
    try {
      const rows = await listOutboxEvents(filter === "all" ? undefined : filter);
      setEvents(rows);
      setMessage(`${rows.length} evento(s) de integração.`);
    } catch {
      setMessage("Entre com uma conta autorizada para visualizar o outbox.");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await getSession();
        await refresh("all");
      } catch {
        setMessage("Entre com uma conta autorizada para visualizar o outbox.");
      }
    })();
  }, [refresh]);

  async function handleFilterChange(filter: OutboxStatusFilter) {
    setStatusFilter(filter);
    setBusy(true);
    try {
      await refresh(filter);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <button
          className="button secondary"
          onClick={() => void refresh(statusFilter)}
          type="button"
        >
          <RotateCw size={16} /> Atualizar
        </button>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Gauge size={16} /> Integração
        </span>
        <h1>Outbox de eventos</h1>
        <p>{message}</p>
      </section>
      <section className="outbox-toolbar">
        <select
          value={statusFilter}
          onChange={(event) => void handleFilterChange(event.target.value as OutboxStatusFilter)}
        >
          <option value="all">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="processed">Processados</option>
          <option value="failed">Com erro</option>
        </select>
      </section>
      <section className="workspace-list-section">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Eventos</span>
            <h2>Lista de eventos</h2>
          </div>
        </div>
        {events.length > 0 ? (
          events.map((event) => (
            <div className="inventory-row" key={event.id}>
              <div>
                <strong>{event.topic}</strong>
                <small>
                  {readOutboxPayloadSummary(event)} · {readRelativeTime(event.createdAt)}
                </small>
              </div>
              <span className={`gm-badge gm-badge-${readOutboxTone(event.status)}`}>
                {readOutboxStatus(event)}
              </span>
            </div>
          ))
        ) : (
          <p className="muted-copy">Nenhum evento registrado.</p>
        )}
      </section>
    </main>
  );
}
