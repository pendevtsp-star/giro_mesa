"use client";

import { Gauge, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  readAuditActionLabel,
  readAuditOperator,
  readAuditSummary,
  readRelativeTime,
} from "../../../lib/formatters/app-dashboard";
import {
  type AuditEvent,
  getSession,
  listAuditEvents,
  listUsers,
  type TenantUser,
} from "../../../lib/giromesa-api";

type AuditFilters = {
  action: string;
  userId: string;
  entityType: string;
  dateFrom: string;
  dateTo: string;
};

const defaultFilters: AuditFilters = {
  action: "",
  userId: "",
  entityType: "",
  dateFrom: "",
  dateTo: "",
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [filters, setFilters] = useState<AuditFilters>(defaultFilters);
  const [message, setMessage] = useState("Carregando eventos de auditoria...");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (activeFilters: AuditFilters) => {
    try {
      const rows = await listAuditEvents(activeFilters);
      setEvents(rows);
      setMessage(`${rows.length} evento(s) de auditoria.`);
    } catch {
      setMessage("Entre com uma conta autorizada para visualizar auditoria.");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await getSession();
        const apiUsers = await listUsers();
        setUsers(apiUsers);
        await refresh(defaultFilters);
      } catch {
        setMessage("Entre com uma conta autorizada para visualizar auditoria.");
      }
    })();
  }, [refresh]);

  async function handleApplyFilters() {
    setBusy(true);
    try {
      await refresh(filters);
      setMessage("Filtros de auditoria aplicados.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearFilters() {
    setFilters(defaultFilters);
    setBusy(true);
    try {
      await refresh(defaultFilters);
      setMessage("Filtros de auditoria limpos.");
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
        <button className="button secondary" onClick={() => void refresh(filters)} type="button">
          <Gauge size={16} /> Atualizar
        </button>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Gauge size={16} /> Auditoria
        </span>
        <h1>Eventos sensíveis</h1>
        <p>{message}</p>
      </section>
      <section className="audit-filters">
        <label>
          Ação
          <input
            value={filters.action}
            onChange={(event) =>
              setFilters((current) => ({ ...current, action: event.target.value }))
            }
            placeholder="Ex.: pagamento, comanda, reserva"
          />
        </label>
        <label>
          Usuário
          <select
            value={filters.userId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, userId: event.target.value }))
            }
          >
            <option value="">Todos</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entidade
          <input
            value={filters.entityType}
            onChange={(event) =>
              setFilters((current) => ({ ...current, entityType: event.target.value }))
            }
            placeholder="Ex.: comanda ou pagamento"
          />
        </label>
        <label>
          De
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              setFilters((current) => ({ ...current, dateFrom: event.target.value }))
            }
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) =>
              setFilters((current) => ({ ...current, dateTo: event.target.value }))
            }
          />
        </label>
        <button
          className="button secondary compact"
          type="button"
          onClick={() => void handleApplyFilters()}
          disabled={busy}
        >
          <Search size={15} /> Filtrar
        </button>
        <button
          className="button ghost compact"
          type="button"
          onClick={() => void handleClearFilters()}
          disabled={busy}
        >
          <X size={15} /> Limpar
        </button>
      </section>
      <section className="workspace-list-section">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Eventos</span>
            <h2>Lista de auditoria</h2>
          </div>
        </div>
        {events.length > 0 ? (
          events.map((event) => (
            <article className="audit-event-row" key={event.id}>
              <div className="audit-event-heading">
                <strong>{readAuditActionLabel(event.action)}</strong>
                <time dateTime={event.createdAt}>{readRelativeTime(event.createdAt)}</time>
              </div>
              <p>{readAuditSummary(event)}</p>
              <small>Realizado por {readAuditOperator(event)}</small>
              <details>
                <summary>Detalhes técnicos</summary>
                <code>{event.action}</code>
              </details>
            </article>
          ))
        ) : (
          <p className="muted-copy">Nenhum evento de auditoria registrado.</p>
        )}
      </section>
    </main>
  );
}
