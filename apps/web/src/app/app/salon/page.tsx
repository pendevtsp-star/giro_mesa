"use client";

import { LayoutGrid, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { getSession, listTables, type DiningTable } from "../../../lib/giromesa-api";

const tones: Record<string, string> = {
  free: "free",
  occupied: "occupied",
  preparing: "preparing",
  waiting_payment: "payment",
  reserved: "reserved",
  served: "served",
  order_sent: "preparing",
  waiting_order: "reserved",
};

export default function SalonPage() {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [message, setMessage] = useState("Carregando mapa do salão...");
  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error();
        const rows = await listTables(session.branchId);
        setTables(rows);
        setMessage(`${rows.length} mesas configuradas nesta unidade.`);
      } catch {
        setMessage("Entre com um perfil operacional para carregar o mapa real.");
      }
    })();
  }, []);

  return (
    <main className="salon-page">
      <header className="kds-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <a className="button primary" href="/app?view=pos">
          Abrir PDV
        </a>
      </header>
      <section className="salon-header">
        <span className="section-kicker">
          <LayoutGrid size={16} /> Salão
        </span>
        <h1>Mapa de mesas</h1>
        <p>{message}</p>
      </section>
      <section className="salon-legend" aria-label="Legenda de status">
        <span className="free">Livre</span>
        <span className="occupied">Em atendimento</span>
        <span className="preparing">Em preparo</span>
        <span className="payment">Pagamento</span>
      </section>
      <section className="salon-board" aria-label="Mesas do salão">
        {tables.map((table) => (
          <a
            className={`salon-table ${tones[table.status] ?? "reserved"}`}
            href={`/app?view=pos&table=${table.id}`}
            key={table.id}
          >
            <strong>{table.code}</strong>
            <span>{table.name}</span>
            <small>
              <Users size={14} />
              {table.seats} lugares
            </small>
          </a>
        ))}
      </section>
    </main>
  );
}
