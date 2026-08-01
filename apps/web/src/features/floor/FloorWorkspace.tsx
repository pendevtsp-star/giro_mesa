"use client";

import { CalendarClock, Check, Clock3, RefreshCw, UsersRound, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  createFloorReservation,
  createWaitlistEntry,
  type DiningTable,
  type FloorReservation,
  listFloorReservations,
  listWaitlistEntries,
  seatFloorReservation,
  updateFloorReservation,
  updateFloorWaitlist,
  type WaitlistEntry,
} from "../../lib/giromesa-api";

const RESERVATION_STATUS: Record<FloorReservation["status"], string> = {
  booked: "Reservada",
  arrived: "Chegou",
  seated: "Acomodada",
  no_show: "Não compareceu",
  canceled: "Cancelada",
};

const WAITLIST_STATUS: Record<WaitlistEntry["status"], string> = {
  waiting: "Aguardando",
  notified: "Notificado",
  seated: "Acomodado",
  left: "Saiu",
  canceled: "Cancelado",
};

function elapsedMinutes(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
}

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
  const [selectedReservationTableIds, setSelectedReservationTableIds] = useState<string[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [reservationRows, waitlistRows] = await Promise.all([
      listFloorReservations(),
      listWaitlistEntries(),
    ]);
    setReservations(reservationRows);
    setWaitlist(waitlistRows);
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage("Não foi possível carregar reservas e fila."));
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
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
      if (!reservation.scheduledAt) throw new Error("Informe data e hora da reserva.");
      await createFloorReservation({
        customerName: reservation.customerName,
        ...(reservation.customerPhone ? { customerPhone: reservation.customerPhone } : {}),
        ...(selectedReservationTableIds.length ? { tableIds: selectedReservationTableIds } : {}),
        partySize: Number(reservation.partySize),
        scheduledAt: new Date(reservation.scheduledAt).toISOString(),
      });
      setReservation({ customerName: "", customerPhone: "", partySize: "2", scheduledAt: "" });
      setSelectedReservationTableIds([]);
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

  const availableTables = tables.filter((table) => table.status === "free");
  const tableLabel = (tableId: string) => {
    const table = tables.find((candidate) => candidate.id === tableId);
    return table ? `${table.code} · ${table.seats} lugares` : "Mesa atribuída";
  };

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
      {message ? (
        <p className="muted-copy" role="status">
          {message}
        </p>
      ) : null}

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
              aria-label="Quantidade de pessoas"
              value={reservation.partySize}
              onChange={(event) =>
                setReservation({ ...reservation, partySize: event.target.value })
              }
            />
            <input
              required
              type="datetime-local"
              aria-label="Data e hora da reserva"
              value={reservation.scheduledAt}
              onChange={(event) =>
                setReservation({ ...reservation, scheduledAt: event.target.value })
              }
            />
            <button className="button primary compact" type="submit" disabled={busy}>
              Reservar
            </button>
          </form>
          <label className="floor-table-selector">
            Mesas previstas (opcional)
            <select
              multiple
              value={selectedReservationTableIds}
              onChange={(event) =>
                setSelectedReservationTableIds(
                  Array.from(event.target.selectedOptions, (option) => option.value),
                )
              }
            >
              {availableTables.length === 0 ? <option disabled>Nenhuma mesa livre</option> : null}
              {availableTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code} · {table.seats} lugares
                </option>
              ))}
            </select>
            <small>Use Ctrl/Cmd para selecionar mais de uma mesa.</small>
          </label>
          <div className="floor-entry-list">
            {reservations.map((entry) => {
              const assignedTableIds = entry.tableIds ?? (entry.tableId ? [entry.tableId] : []);
              return (
                <div className="floor-entry" key={entry.id}>
                  <div>
                    <strong>{entry.customerName}</strong>
                    <small>
                      {entry.partySize} pessoas ·{" "}
                      {new Date(entry.scheduledAt).toLocaleString("pt-BR")}
                    </small>
                    <small>
                      {assignedTableIds.length
                        ? assignedTableIds.map(tableLabel).join(", ")
                        : "Mesa ainda não definida"}
                    </small>
                  </div>
                  <div className="floor-entry-actions">
                    <span className={`count-chip status-${entry.status}`}>
                      {RESERVATION_STATUS[entry.status]}
                    </span>
                    {entry.status === "booked" ? (
                      <button
                        className="button ghost compact"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => updateFloorReservation(entry.id, { status: "arrived" }),
                            "Chegada registrada.",
                          )
                        }
                      >
                        <Check size={14} /> Chegou
                      </button>
                    ) : null}
                    {entry.status === "arrived" || entry.status === "booked" ? (
                      <button
                        className="button primary compact"
                        type="button"
                        disabled={busy || (!assignedTableIds.length && !selectedTableId)}
                        onClick={() =>
                          void run(
                            () =>
                              seatFloorReservation(
                                entry.id,
                                assignedTableIds[0] ?? selectedTableId,
                              ).then(() => undefined),
                            "Reserva acomodada e atendimento aberto.",
                          )
                        }
                      >
                        Acomodar
                      </button>
                    ) : null}
                    {entry.status === "booked" || entry.status === "arrived" ? (
                      <>
                        <button
                          className="button ghost compact"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => updateFloorReservation(entry.id, { status: "no_show" }),
                              "Reserva marcada como não compareceu.",
                            )
                          }
                        >
                          Não compareceu
                        </button>
                        <button
                          className="button ghost compact"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => updateFloorReservation(entry.id, { status: "canceled" }),
                              "Reserva cancelada.",
                            )
                          }
                        >
                          <X size={14} /> Cancelar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
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
              aria-label="Quantidade de pessoas na fila"
              value={waiting.partySize}
              onChange={(event) => setWaiting({ ...waiting, partySize: event.target.value })}
            />
            <input
              required
              type="number"
              min="0"
              max="1440"
              aria-label="Previsão de espera em minutos"
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
                    {entry.partySize} pessoas · há {elapsedMinutes(entry.createdAt)} min · previsão{" "}
                    {entry.quotedWaitMinutes ?? 0} min
                  </small>
                  {entry.tableId ? <small>{tableLabel(entry.tableId)}</small> : null}
                </div>
                <div className="floor-entry-actions">
                  <span className={`count-chip status-${entry.status}`}>
                    {WAITLIST_STATUS[entry.status]}
                  </span>
                  {entry.status === "waiting" ? (
                    <button
                      className="button ghost compact"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => updateFloorWaitlist(entry.id, { status: "notified" }),
                          "Cliente notificado.",
                        )
                      }
                    >
                      <Clock3 size={14} /> Notificar
                    </button>
                  ) : null}
                  {entry.status === "waiting" || entry.status === "notified" ? (
                    <button
                      className="button primary compact"
                      type="button"
                      disabled={busy || !selectedTableId}
                      onClick={() =>
                        void run(
                          () =>
                            updateFloorWaitlist(entry.id, {
                              status: "seated",
                              tableId: selectedTableId,
                            }),
                          "Cliente acomodado.",
                        )
                      }
                    >
                      Acomodar
                    </button>
                  ) : null}
                  {entry.status === "waiting" || entry.status === "notified" ? (
                    <>
                      <button
                        className="button ghost compact"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => updateFloorWaitlist(entry.id, { status: "left" }),
                            "Cliente removido da fila.",
                          )
                        }
                      >
                        Saiu
                      </button>
                      <button
                        className="button ghost compact"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => updateFloorWaitlist(entry.id, { status: "canceled" }),
                            "Entrada cancelada.",
                          )
                        }
                      >
                        <X size={14} /> Cancelar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
