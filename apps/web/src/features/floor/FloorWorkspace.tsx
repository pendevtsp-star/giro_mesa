"use client";

import { CalendarClock, RefreshCw, UsersRound } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  createFloorReservation,
  createWaitlistEntry,
  type DiningTable,
  type FloorReservation,
  listFloorReservations,
  listWaitlistEntries,
  seatFloorReservation,
  type WaitlistEntry,
} from "../../lib/giromesa-api";

export function FloorWorkspace({
  tables,
  onChanged,
}: {
  tables: DiningTable[];
  onChanged: () => Promise<void> | void;
}) {
  const [reservations, setReservations] = useState<FloorReservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [reservation, setReservation] = useState({
    customerName: "",
    customerPhone: "",
    partySize: "2",
    scheduledAt: "",
  });
  const [waiting, setWaiting] = useState({
    customerName: "",
    customerPhone: "",
    partySize: "2",
    quotedWaitMinutes: "20",
  });
  const [selectedTableId, setSelectedTableId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [reservationRows, waitlistRows] = await Promise.all([
      listFloorReservations(),
      listWaitlistEntries("waiting"),
    ]);
    setReservations(reservationRows);
    setWaitlist(waitlistRows);
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage("Não foi possível carregar reservas e fila."));
  }, [load]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      await load();
      await onChanged();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na operação do salão.");
    } finally {
      setBusy(false);
    }
  }

  function submitReservation(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await createFloorReservation({
        customerName: reservation.customerName,
        ...(reservation.customerPhone ? { customerPhone: reservation.customerPhone } : {}),
        partySize: Number(reservation.partySize),
        scheduledAt: new Date(reservation.scheduledAt).toISOString(),
      });
      setReservation({ customerName: "", customerPhone: "", partySize: "2", scheduledAt: "" });
    }, "Reserva criada.");
  }

  function submitWaitlist(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await createWaitlistEntry({
        customerName: waiting.customerName,
        ...(waiting.customerPhone ? { customerPhone: waiting.customerPhone } : {}),
        partySize: Number(waiting.partySize),
        quotedWaitMinutes: Number(waiting.quotedWaitMinutes),
      });
      setWaiting({ customerName: "", customerPhone: "", partySize: "2", quotedWaitMinutes: "20" });
    }, "Cliente incluído na fila.");
  }

  const availableTables = tables.filter((table) => ["free", "reserved"].includes(table.status));

  return (
    <section className="floor-operations">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">
            <CalendarClock size={15} /> Recepção
          </span>
          <h2>Reservas e fila de espera</h2>
        </div>
        <button
          className="button ghost compact"
          type="button"
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>
      {message ? <p className="muted-copy">{message}</p> : null}

      <div className="floor-operations-grid">
        <article className="workspace-panel">
          <h3>Nova reserva</h3>
          <form className="floor-inline-form" onSubmit={submitReservation}>
            <input
              required
              placeholder="Nome do cliente"
              value={reservation.customerName}
              onChange={(event) =>
                setReservation({ ...reservation, customerName: event.target.value })
              }
            />
            <input
              placeholder="Telefone"
              value={reservation.customerPhone}
              onChange={(event) =>
                setReservation({ ...reservation, customerPhone: event.target.value })
              }
            />
            <input
              required
              type="number"
              min="1"
              max="100"
              value={reservation.partySize}
              onChange={(event) =>
                setReservation({ ...reservation, partySize: event.target.value })
              }
            />
            <input
              required
              type="datetime-local"
              value={reservation.scheduledAt}
              onChange={(event) =>
                setReservation({ ...reservation, scheduledAt: event.target.value })
              }
            />
            <button className="button primary compact" type="submit" disabled={busy}>
              Reservar
            </button>
          </form>
          <div className="floor-entry-list">
            {reservations
              .filter((entry) => ["booked", "arrived"].includes(entry.status))
              .map((entry) => (
                <div className="floor-entry" key={entry.id}>
                  <div>
                    <strong>{entry.customerName}</strong>
                    <small>
                      {entry.partySize} pessoas ·{" "}
                      {new Date(entry.scheduledAt).toLocaleString("pt-BR")}
                    </small>
                  </div>
                  <button
                    className="button ghost compact"
                    type="button"
                    disabled={busy || !selectedTableId}
                    onClick={() =>
                      void run(
                        () => seatFloorReservation(entry.id, selectedTableId).then(() => undefined),
                        "Reserva acomodada e pedido aberto.",
                      )
                    }
                  >
                    Acomodar
                  </button>
                </div>
              ))}
          </div>
        </article>

        <article className="workspace-panel">
          <h3>
            <UsersRound size={17} /> Fila de espera
          </h3>
          <form className="floor-inline-form" onSubmit={submitWaitlist}>
            <input
              required
              placeholder="Nome do cliente"
              value={waiting.customerName}
              onChange={(event) => setWaiting({ ...waiting, customerName: event.target.value })}
            />
            <input
              placeholder="Telefone"
              value={waiting.customerPhone}
              onChange={(event) => setWaiting({ ...waiting, customerPhone: event.target.value })}
            />
            <input
              required
              type="number"
              min="1"
              max="100"
              value={waiting.partySize}
              onChange={(event) => setWaiting({ ...waiting, partySize: event.target.value })}
            />
            <input
              required
              type="number"
              min="0"
              max="1440"
              value={waiting.quotedWaitMinutes}
              onChange={(event) =>
                setWaiting({ ...waiting, quotedWaitMinutes: event.target.value })
              }
            />
            <button className="button primary compact" type="submit" disabled={busy}>
              Adicionar
            </button>
          </form>
          <label className="floor-table-selector">
            Mesa para acomodação
            <select
              value={selectedTableId}
              onChange={(event) => setSelectedTableId(event.target.value)}
            >
              <option value="">Selecione uma mesa livre</option>
              {availableTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code} · {table.seats} lugares
                </option>
              ))}
            </select>
          </label>
          <div className="floor-entry-list">
            {waitlist.map((entry) => (
              <div className="floor-entry" key={entry.id}>
                <div>
                  <strong>{entry.customerName}</strong>
                  <small>
                    {entry.partySize} pessoas · previsão {entry.quotedWaitMinutes ?? 0} min
                  </small>
                </div>
                <span className="count-chip">aguardando</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
