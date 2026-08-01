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
import {
  buildRealtimeEventsUrl,
  getSession,
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

type KdsPayloadItem = {
  id?: string;
  name?: string;
  quantity?: string | number;
  notes?: string | null;
  modifiers?: unknown;
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

export default function KdsPage() {
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [station, setStation] = useState("all");
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
  const soundEnabledRef = useRef(false);
  const volumeRef = useRef(0.65);
  const initializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  async function load() {
    try {
      const [ticketRows, stationRows] = await Promise.all([listKdsTickets(), listKdsStations()]);
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
    if (soundEnabled && next === "ready") {
      playAlert(audioContextRef.current, volume);
      window.navigator.vibrate?.(80);
    }
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

  // O KDS precisa continuar operável em monitor sem toque ou com bump bar.
  // ponytail: atalhos ficam locais à tela; um mapeador por estação entra na fase de configuração.
  // biome-ignore lint/correctness/useExhaustiveDependencies: atalhos devem apontar para o estado atual da tela.
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void load();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void toggleSound();
      } else if (event.key === " " && focusedTicketId) {
        event.preventDefault();
        const ticket = visible.find((item) => item.id === focusedTicketId);
        if (ticket) void advance(ticket);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!visible.length) return;
        const currentIndex = visible.findIndex((item) => item.id === focusedTicketId);
        if (currentIndex < 0) {
          setFocusedTicketId(visible[0]?.id ?? null);
          return;
        }
        const nextIndex = event.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
        setFocusedTicketId(visible[(nextIndex + visible.length) % visible.length]?.id ?? null);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [focusedTicketId, visible]);

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
            aria-label={isFullscreen ? "Sair da tela cheia" : "Abrir tela cheia"}
            className="button secondary compact"
            onClick={() => void toggleFullscreen()}
            title="Tela cheia (F)"
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
        <p className="kds-shortcuts" title="Atalhos disponíveis">
          <Keyboard size={15} /> R atualizar · S som · F tela cheia · ↑↓ selecionar · Espaço avançar
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
              aria-keyshortcuts="Space ArrowDown ArrowUp"
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
