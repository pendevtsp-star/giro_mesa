"use client";

import {
  AlertTriangle,
  Bell,
  ChefHat,
  Clock3,
  Keyboard,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveKdsStationScope } from "../../../features/kds/device-station";
import {
  buildRealtimeEventsUrl,
  getBranchOperationalSettings,
  getSession,
  type KdsTicket,
  listKdsStations,
  listKdsTickets,
  recallLastDeliveredKdsTicket,
  updateKdsTicket,
  updateKdsTicketItem,
} from "../../../lib/giromesa-api";
import { useSession } from "../../../lib/session-context";

const statusLabel: Record<string, string> = {
  sent: "Novo",
  preparing: "Em preparo",
  ready: "Pronto",
  served: "Entregue",
};

type KdsPayloadItem = {
  id?: string;
  name?: string;
  quantity?: string | number;
  notes?: string | null;
  modifiers?: unknown;
  status?: "sent" | "preparing" | "ready" | "served";
};

type KdsCancellation = {
  name?: string;
  reason?: string;
};

function readKdsItems(payload: Record<string, unknown>) {
  return Array.isArray(payload.items)
    ? payload.items.filter(
        (item): item is KdsPayloadItem => Boolean(item) && typeof item === "object",
      )
    : [];
}

function readKdsCancellations(payload: Record<string, unknown>) {
  return Array.isArray(payload.cancellations)
    ? payload.cancellations.filter(
        (item): item is KdsCancellation => Boolean(item) && typeof item === "object",
      )
    : [];
}

function readModifierNames(modifiers: unknown) {
  return Array.isArray(modifiers)
    ? modifiers
        .filter(
          (modifier): modifier is Record<string, unknown> =>
            Boolean(modifier) && typeof modifier === "object",
        )
        .map((modifier) => (typeof modifier.name === "string" ? modifier.name : ""))
        .filter(Boolean)
    : [];
}

const defaultShortcuts = {
  refresh: "r",
  sound: "s",
  fullscreen: "f",
  advance: " ",
  return: "Backspace",
  recall: "l",
  up: "ArrowUp",
  down: "ArrowDown",
};

function matchesShortcut(event: KeyboardEvent, shortcut: string | undefined) {
  if (!shortcut) return false;
  return shortcut.length === 1
    ? event.key.toLowerCase() === shortcut.toLowerCase()
    : event.key === shortcut;
}

export default function KdsPage() {
  const { operationalDevice, isLoading: sessionLoading } = useSession();
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [requestedStation, setRequestedStation] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [message, setMessage] = useState("Carregando produção...");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [volume, setVolume] = useState(0.65);
  const [now, setNow] = useState(() => Date.now());
  const [connectionState, setConnectionState] = useState<"connecting" | "realtime" | "polling">(
    "connecting",
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusedTicketId, setFocusedTicketId] = useState<string | null>(null);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const [shortcuts, setShortcuts] = useState(defaultShortcuts);
  const soundEnabledRef = useRef(false);
  const volumeRef = useRef(0.65);
  const initializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const stationScope = useMemo(
    () => resolveKdsStationScope(operationalDevice, requestedStation),
    [operationalDevice, requestedStation],
  );
  const station = stationScope.stationId;

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("stationId");
    if (requested) setRequestedStation(requested);
  }, []);
  async function load() {
    try {
      const [ticketRows, stationRows, session] = await Promise.all([
        listKdsTickets(station === "all" ? {} : { stationId: station }),
        listKdsStations(),
        getSession(),
      ]);
      if (session.branchId) {
        const settings = await getBranchOperationalSettings(session.branchId);
        setShortcuts({ ...defaultShortcuts, ...settings.kdsShortcuts });
      }
      setTickets((current) => {
        const currentIds = new Set(current.map((ticket) => ticket.id));
        if (
          initializedRef.current &&
          soundEnabledRef.current &&
          ticketRows.some((ticket) => !currentIds.has(ticket.id) && ticket.status === "sent")
        ) {
          playAlert(audioContextRef.current, volumeRef.current);
        }
        initializedRef.current = true;
        return ticketRows;
      });
      setStations(stationRows.map((item) => ({ id: item.id, name: item.name })));
      setMessage(`${ticketRows.length} ticket(s) no fluxo de produção.`);
    } catch {
      setMessage("Entre com o perfil de cozinha ou bar para operar a produção.");
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: carregamento inicial do KDS.
  useEffect(() => {
    void load();
    const polling = window.setInterval(() => void load(), 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    let events: EventSource | null = null;
    let connectionTimer: number | undefined;
    let stopped = false;
    async function connectRealtime() {
      try {
        const session = await getSession();
        if (stopped || !session.branchId) {
          setConnectionState("polling");
          return;
        }
        events = new EventSource(buildRealtimeEventsUrl(session.branchId), {
          withCredentials: true,
        });
        events.onopen = () => setConnectionState("realtime");
        events.onmessage = () => void load();
        events.onerror = () => {
          events?.close();
          events = null;
          setConnectionState("polling");
          setMessage("Tempo real indisponível; polling continua ativo.");
          if (!stopped) connectionTimer = window.setTimeout(() => void connectRealtime(), 5_000);
        };
      } catch {
        setConnectionState("polling");
        if (!stopped) connectionTimer = window.setTimeout(() => void connectRealtime(), 5_000);
      }
    }
    connectionTimer = window.setTimeout(() => void connectRealtime(), 1_500);
    return () => {
      stopped = true;
      window.clearInterval(polling);
      window.clearInterval(clock);
      if (connectionTimer !== undefined) window.clearTimeout(connectionTimer);
      events?.close();
    };
  }, []);
  const visible = useMemo(
    () =>
      (sessionLoading ? [] : tickets)
        .filter((ticket) => station === "all" || ticket.stationId === station)
        .filter((ticket) =>
          statusFilter === "active" ? ticket.status !== "served" : ticket.status === statusFilter,
        )
        .sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0)),
    [sessionLoading, station, statusFilter, tickets],
  );
  async function advance(ticket: KdsTicket) {
    const next =
      ticket.status === "sent" ? "preparing" : ticket.status === "preparing" ? "ready" : "served";
    const updated = await updateKdsTicket(ticket.id, next);
    setTickets((current) =>
      current.map((item) => (item.id === ticket.id ? { ...item, ...updated } : item)),
    );
    if (soundEnabled && next === "ready") {
      playAlert(audioContextRef.current, volume);
      window.navigator.vibrate?.(80);
    }
  }

  async function returnTicket(ticket: KdsTicket) {
    if (ticket.status !== "ready") return;
    const updated = await updateKdsTicket(ticket.id, "preparing");
    setTickets((current) =>
      current.map((item) => (item.id === ticket.id ? { ...item, ...updated } : item)),
    );
    setMessage("Ticket retornado para preparo e registrado na auditoria.");
  }

  async function advanceItem(ticket: KdsTicket, item: KdsPayloadItem) {
    if (!item.id) return;
    const current = item.status ?? "sent";
    const next = current === "sent" ? "preparing" : current === "preparing" ? "ready" : "served";
    const updated = await updateKdsTicketItem(ticket.id, item.id, next);
    setTickets((currentTickets) =>
      currentTickets.map((currentTicket) =>
        currentTicket.id === ticket.id ? { ...currentTicket, ...updated } : currentTicket,
      ),
    );
  }

  async function returnItem(ticket: KdsTicket, item: KdsPayloadItem) {
    if (!item.id || item.status !== "ready") return;
    const updated = await updateKdsTicketItem(ticket.id, item.id, "preparing");
    setTickets((currentTickets) =>
      currentTickets.map((currentTicket) =>
        currentTicket.id === ticket.id ? { ...currentTicket, ...updated } : currentTicket,
      ),
    );
    setMessage("Item retornado para preparo e registrado na auditoria.");
  }
  async function toggleSound() {
    const next = !soundEnabled;
    if (next) {
      try {
        const context = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = context;
        await context.resume();
        playAlert(context, volume);
      } catch {
        setMessage("Som bloqueado pelo navegador; clique novamente para liberar.");
        return;
      }
    }
    soundEnabledRef.current = next;
    setSoundEnabled(next);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await pageRef.current?.requestFullscreen?.();
      }
    } catch {
      setMessage("O navegador não permitiu tela cheia; continue pela janela atual.");
    }
  }

  async function recallLastDelivery() {
    const stationId =
      station !== "all"
        ? station
        : tickets.find((ticket) => ticket.id === focusedTicketId)?.stationId;
    if (!stationId) {
      setMessage("Selecione uma estação ou um ticket para rever a última entrega.");
      return;
    }
    try {
      const recalled = await recallLastDeliveredKdsTicket(stationId);
      setTickets((current) =>
        current.some((ticket) => ticket.id === recalled.id)
          ? current.map((ticket) => (ticket.id === recalled.id ? recalled : ticket))
          : [...current, recalled],
      );
      setStatusFilter("served");
      setFocusedTicketId(recalled.id);
      setMessage("Última entrega recuperada do servidor; o status não foi alterado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível rever a entrega.");
    }
  }

  // O KDS precisa continuar operável em monitor sem toque ou com bump bar.
  // ponytail: atalhos ficam locais à tela; um mapeador por estação entra na fase de configuração.
  // biome-ignore lint/correctness/useExhaustiveDependencies: atalhos devem apontar para o estado atual da tela.
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      if (matchesShortcut(event, shortcuts.refresh)) {
        event.preventDefault();
        void load();
      } else if (matchesShortcut(event, shortcuts.fullscreen)) {
        event.preventDefault();
        void toggleFullscreen();
      } else if (matchesShortcut(event, shortcuts.sound)) {
        event.preventDefault();
        void toggleSound();
      } else if (matchesShortcut(event, shortcuts.advance) && focusedTicketId) {
        event.preventDefault();
        const ticket = visible.find((item) => item.id === focusedTicketId);
        if (ticket) void advance(ticket);
      } else if (matchesShortcut(event, shortcuts.return) && focusedTicketId) {
        event.preventDefault();
        const ticket = visible.find((item) => item.id === focusedTicketId);
        if (ticket) void returnTicket(ticket);
      } else if (matchesShortcut(event, shortcuts.recall)) {
        event.preventDefault();
        void recallLastDelivery();
      } else if (matchesShortcut(event, shortcuts.down) || matchesShortcut(event, shortcuts.up)) {
        event.preventDefault();
        if (!visible.length) return;
        const currentIndex = visible.findIndex((item) => item.id === focusedTicketId);
        if (currentIndex < 0) {
          setFocusedTicketId(visible[0]?.id ?? null);
          return;
        }
        const nextIndex = matchesShortcut(event, shortcuts.down)
          ? currentIndex + 1
          : currentIndex - 1;
        setFocusedTicketId(visible[(nextIndex + visible.length) % visible.length]?.id ?? null);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [focusedTicketId, shortcuts, visible]);

  return (
    <main className="kds-page" ref={pageRef}>
      <header className="kds-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark brand-mark-logo" aria-hidden="true" />
          <span>GiroMesa</span>
        </a>
        <div className="toolbar">
          <button
            className={soundEnabled ? "button primary compact" : "button secondary compact"}
            onClick={() => void toggleSound()}
            type="button"
          >
            <Bell size={16} /> Som
          </button>
          <label className="kds-volume">
            Volume
            <input
              aria-label="Volume dos alertas"
              disabled={!soundEnabled}
              max="1"
              min="0"
              onChange={(event) => {
                const next = Number(event.target.value);
                volumeRef.current = next;
                setVolume(next);
              }}
              step="0.05"
              type="range"
              value={volume}
            />
          </label>
          <button className="button secondary compact" onClick={() => void load()} type="button">
            <RefreshCw size={16} /> Atualizar
          </button>
          <button
            className="button secondary compact"
            onClick={() => void recallLastDelivery()}
            title={`Rever última entrega (${shortcuts.recall})`}
            type="button"
          >
            Rever última entrega
          </button>
          <button
            aria-label={isFullscreen ? "Sair da tela cheia" : "Abrir tela cheia"}
            className="button secondary compact"
            onClick={() => void toggleFullscreen()}
            title={`Tela cheia (${shortcuts.fullscreen})`}
            type="button"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>
      <section className="kds-header">
        <div>
          <span className="section-kicker">
            <ChefHat size={16} /> Produção
          </span>
          <h1>KDS</h1>
          <p className={`kds-connection kds-connection-${connectionState}`}>
            {connectionState === "realtime"
              ? "Tempo real"
              : connectionState === "polling"
                ? "Polling"
                : "Conectando"}
            <span aria-hidden="true"> · </span>
            {message}
          </p>
        </div>
        <label>
          Estação
          <select
            value={station}
            disabled={stationScope.locked}
            onChange={(event) => setRequestedStation(event.target.value)}
            aria-describedby={stationScope.locked ? "kds-bound-station" : undefined}
          >
            {stationScope.locked ? null : <option value="all">Todas</option>}
            {stations
              .filter((item) => !stationScope.locked || item.id === station)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          {stationScope.locked ? (
            <small id="kds-bound-station">Estação vinculada a este terminal</small>
          ) : null}
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
        <p className="kds-shortcuts" title="Atalhos configurados pela administração">
          <Keyboard size={15} />
          <span>
            {shortcuts.refresh.toUpperCase()} atualizar · {shortcuts.sound.toUpperCase()} som ·{" "}
            {shortcuts.fullscreen.toUpperCase()} tela cheia · {shortcuts.up}/{shortcuts.down}{" "}
            selecionar · {shortcuts.advance === " " ? "Espaço" : shortcuts.advance} avançar
            {" · "}
            {shortcuts.return} retornar · {shortcuts.recall.toUpperCase()} rever entrega
          </span>
        </p>
      </section>
      <section className="kds-board">
        {visible.map((ticket) => {
          const items = readKdsItems(ticket.payload);
          const cancellations = readKdsCancellations(ticket.payload);
          const ageMinutes = ageInMinutes(ticket.createdAt, now);
          const late = ageMinutes >= 15 && ticket.status !== "served";
          return (
            <article
              className={`kds-ticket kds-${ticket.status}${late ? " is-late" : ""}${focusedTicketId === ticket.id ? " is-focused" : ""}`}
              key={ticket.id}
            >
              <div>
                <span>{ticket.stationName}</span>
                <strong>
                  {ticket.tableCode
                    ? `Mesa ${ticket.tableCode}`
                    : `Pedido ${ticket.orderId.slice(0, 5)}`}
                </strong>
                <small>
                  <Clock3 size={14} /> {readAge(ticket.createdAt, now)}
                </small>
              </div>
              {items.length ? (
                <ul className="kds-ticket-items">
                  {items.map((item) => {
                    const modifiers = readModifierNames(item.modifiers);
                    return (
                      <li
                        className="kds-item"
                        key={
                          item.id ??
                          `${item.name ?? "item"}-${item.quantity ?? 1}-${item.notes ?? ""}`
                        }
                      >
                        <strong>
                          {item.quantity ?? 1}× {item.name ?? "Item"}
                        </strong>
                        {modifiers.length ? <span>{modifiers.join(" · ")}</span> : null}
                        {item.notes ? <small>{item.notes}</small> : null}
                        {item.id ? (
                          <>
                            <button
                              className="button ghost compact kds-item-action"
                              type="button"
                              onClick={() => void advanceItem(ticket, item)}
                            >
                              {item.status === "sent" || !item.status
                                ? "Iniciar item"
                                : item.status === "preparing"
                                  ? "Marcar item pronto"
                                  : item.status === "ready"
                                    ? "Entregar item"
                                    : "Entregue"}
                            </button>
                            {item.status === "ready" ? (
                              <button
                                className="button ghost compact kds-item-action"
                                type="button"
                                onClick={() => void returnItem(ticket, item)}
                              >
                                Retornar item
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>{String(ticket.payload.summary ?? "Itens do pedido")}</p>
              )}
              {cancellations.length ? (
                <div className="kds-cancellation">
                  <AlertTriangle size={15} />
                  <span>
                    {cancellations
                      .map((item) => `${item.name ?? "Item"}: ${item.reason ?? "cancelado"}`)
                      .join(" · ")}
                  </span>
                </div>
              ) : null}
              <footer>
                <span>
                  {statusLabel[ticket.status] ?? ticket.status}
                  {ticket.priority ? ` · prioridade ${ticket.priority}` : ""}
                  {late ? " · atrasado" : ""}
                </span>
                {ticket.status !== "served" ? (
                  <div>
                    {ticket.status === "ready" ? (
                      <button
                        className="button secondary compact"
                        type="button"
                        onClick={() => void returnTicket(ticket)}
                      >
                        Retornar
                      </button>
                    ) : null}
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
                  </div>
                ) : null}
              </footer>
            </article>
          );
        })}
        {!visible.length ? (
          <p className="muted-copy">Nenhum ticket ativo para esta estação.</p>
        ) : null}
      </section>
    </main>
  );
}

function ageInMinutes(createdAt: string, now: number) {
  return Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60000));
}

function readAge(createdAt: string, now: number) {
  const minutes = ageInMinutes(createdAt, now);
  if (minutes <= 0) {
    return "agora";
  }
  return `${minutes} min`;
}

function playAlert(context: AudioContext | null, volume: number) {
  if (context?.state !== "running") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.16);
  gain.gain.setValueAtTime(Math.max(0.01, volume * 0.22), context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);
}
