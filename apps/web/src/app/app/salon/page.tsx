"use client";
import { LayoutGrid, Link2, Plus, Save, Undo2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FloorWorkspace } from "../../../features/floor/FloorWorkspace";
import { moveTablesInLayout } from "../../../features/floor/salon-layout";
import { TableActionPopup } from "../../../features/floor/TableActionPopup";
import {
  acknowledgeServiceRequest,
  createDiningTable,
  type DiningTable,
  getFloorPlan,
  getSession,
  listServiceRequests,
  listTables,
  mergeTables,
  resolveServiceRequest,
  type ServiceRequest,
  saveFloorPlan,
  unmergeTables,
  updateTable,
} from "../../../lib/giromesa-api";

type Position = { x: number; y: number };
const TABLE_W = 150;
const _TABLE_GAP = 12;
const GROUP_COLORS = ["#f97316", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f43f5e"];

function groupColor(groupId: string): string {
  let hash = 0;
  for (const ch of groupId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length] ?? GROUP_COLORS[0] ?? "#f97316";
}

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
  const [branchId, setBranchId] = useState("");
  const [layout, setLayout] = useState<Record<string, Position>>({});
  const [savedLayout, setSavedLayout] = useState<Record<string, Position>>({});
  const [layoutHistory, setLayoutHistory] = useState<Array<Record<string, Position>>>([]);
  const [planVersion, setPlanVersion] = useState(0);
  const [message, setMessage] = useState("Carregando mapa do salão...");
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [form, setForm] = useState({ code: "", name: "", seats: "4" });

  // Canvas state
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    wasDrag: false,
    tableId: "",
  });

  // Popup state
  const [popupTable, setPopupTable] = useState<DiningTable | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  // Merge mode
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());

  // Pan state
  const panRef = useRef({ isPanning: false, startX: 0, startY: 0 });

  const load = useCallback(async (id: string) => {
    const [rows, plan] = await Promise.all([listTables(id), getFloorPlan(id)]);
    setTables(rows);
    setLayout(plan.layout);
    setSavedLayout(plan.layout);
    setLayoutHistory([]);
    setPlanVersion(plan.version);
  }, []);

  const hasUnsavedChanges = JSON.stringify(layout) !== JSON.stringify(savedLayout);

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error();
        setBranchId(session.branchId);
        await load(session.branchId);
        setMessage("Arraste as mesas para organizar o salão e salve a disposição.");
      } catch {
        setMessage("Entre com um perfil operacional para carregar o mapa real.");
      }
    })();
  }, [load]);

  useEffect(() => {
    if (!branchId) return;
    const refreshRequests = () =>
      void listServiceRequests()
        .then((rows) =>
          setServiceRequests(
            rows.filter((request) => ["pending", "acknowledged"].includes(request.status)),
          ),
        )
        .catch(() => undefined);
    refreshRequests();
    const interval = window.setInterval(refreshRequests, 15_000);
    return () => window.clearInterval(interval);
  }, [branchId]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  async function persist() {
    if (!branchId) return;
    try {
      const saved = await saveFloorPlan(branchId, layout, planVersion);
      setPlanVersion(saved.version);
      setSavedLayout(layout);
      setLayoutHistory([]);
      setMessage(`Disposição salva na revisão ${saved.version}.`);
    } catch {
      setMessage(
        "O mapa foi alterado por outra pessoa. Recarregue para comparar antes de salvar novamente.",
      );
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!branchId || !form.code || !form.name) return;
    try {
      const newTable = await createDiningTable({
        branchId,
        code: form.code,
        name: form.name,
        seats: Number(form.seats) || 2,
      });
      setTables((prev) => {
        const index = prev.length;
        setLayoutHistory((history) => [...history.slice(-19), layout]);
        setLayout((current) => ({
          ...current,
          [newTable.id]: {
            x: (index % 4) * 24 + 4,
            y: Math.floor(index / 4) * 28 + 4,
          },
        }));
        return [...prev, newTable];
      });
      setForm({ code: "", name: "", seats: "4" });
      setMessage("Mesa criada. Posicione-a e salve o mapa.");
    } catch {
      setMessage("Não foi possível criar a mesa. Verifique código, nome e capacidade.");
    }
  }

  // === Zoom ===
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.max(0.3, Math.min(3, prev + delta)));
  }, []);

  // === Pan ===
  const handlePanPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest(".salon-table")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      panRef.current = { isPanning: true, startX: e.clientX - pan.x, startY: e.clientY - pan.y };
    },
    [pan],
  );

  const handlePanPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panRef.current.isPanning) return;
    setPan({
      x: e.clientX - panRef.current.startX,
      y: e.clientY - panRef.current.startY,
    });
  }, []);

  const handlePanPointerUp = useCallback(() => {
    panRef.current.isPanning = false;
  }, []);

  // === Table drag ===
  const CLICK_THRESHOLD = 5;

  function handleTablePointerDown(e: React.PointerEvent<HTMLButtonElement>, table: DiningTable) {
    e.preventDefault();
    e.stopPropagation();

    if (mergeMode) {
      setSelectedTables((prev) => {
        const next = new Set(prev);
        if (next.has(table.id)) next.delete(table.id);
        else next.add(table.id);
        return next;
      });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    setLayoutHistory((history) => [...history.slice(-19), layout]);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      wasDrag: false,
      tableId: table.id,
    };
    setDraggingId(table.id);
  }

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingId) return;

      const dx = Math.abs(e.clientX - dragRef.current.startX);
      const dy = Math.abs(e.clientY - dragRef.current.startY);
      if (dx > CLICK_THRESHOLD || dy > CLICK_THRESHOLD) dragRef.current.wasDrag = true;

      if (!dragRef.current.wasDrag) return;

      const board = containerRef.current;
      if (!board) return;
      const delta = {
        x: ((e.clientX - dragRef.current.lastX) / scale / board.clientWidth) * 100,
        y: ((e.clientY - dragRef.current.lastY) / scale / board.clientHeight) * 100,
      };
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;

      setLayout((currentLayout) => {
        const nextLayout = moveTablesInLayout(currentLayout, tables, draggingId, delta);
        const dragged = tables.find((table) => table.id === draggingId);
        const draggedPosition = nextLayout[draggingId];
        if (!dragged || !draggedPosition) return nextLayout;

        let closest: string | null = null;
        let minDist = Infinity;
        tables.forEach((table, index) => {
          if (table.id === draggingId || (dragged.groupId && table.groupId === dragged.groupId)) {
            return;
          }
          const position = nextLayout[table.id] ?? {
            x: (index % 4) * 24 + 4,
            y: Math.floor(index / 4) * 28 + 4,
          };
          const dist = Math.hypot(
            ((position.x - draggedPosition.x) / 100) * board.clientWidth,
            ((position.y - draggedPosition.y) / 100) * board.clientHeight,
          );
          if (dist < 150 && dist < minDist) {
            minDist = dist;
            closest = table.id;
          }
        });
        setDropTargetId(closest);
        return nextLayout;
      });
    },
    [draggingId, scale, tables],
  );

  const handleMergeDrop = useCallback(
    async (dragId: string, targetId: string) => {
      if (!branchId) return;
      try {
        const result = await mergeTables(branchId, [dragId, targetId]);
        setTables(result.data);
        setMessage(
          `${tables.find((t) => t.id === dragId)?.code} e ${tables.find((t) => t.id === targetId)?.code} foram juntadas.`,
        );
      } catch {
        setMessage("Erro ao juntar mesas.");
      }
    },
    [branchId, tables],
  );

  const handleDragUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingId) return;
      const wasClick = !dragRef.current.wasDrag;
      const tableId = dragRef.current.tableId;

      setDraggingId(null);
      setDropTargetId(null);

      if (wasClick) {
        setLayoutHistory((history) => history.slice(0, -1));
        // Click - show popup
        const table = tables.find((t) => t.id === tableId);
        if (table) {
          const rect = (e.target as HTMLElement).closest(".salon-table")?.getBoundingClientRect();
          if (rect) {
            setPopupTable(table);
            setPopupPos({ x: rect.right + 8, y: rect.top });
          }
        }
      } else if (dropTargetId) {
        // Drag onto another table - merge
        handleMergeDrop(draggingId, dropTargetId);
      }
    },
    [draggingId, tables, dropTargetId, handleMergeDrop],
  );

  // === Popup actions ===
  const handlePopupAction = useCallback(
    async (action: string, table: DiningTable, data?: Record<string, unknown>) => {
      setPopupTable(null);

      switch (action) {
        case "new-order":
        case "view-order":
        case "add-item":
        case "goto-pos":
          window.location.href = `/app/pos?tableId=${encodeURIComponent(table.id)}`;
          break;
        case "send-kitchen":
          setMessage(`Enviando pedido da mesa ${table.code} para cozinha...`);
          break;
        case "preview-bill":
          setMessage(`Gerando prévia da mesa ${table.code}...`);
          break;
        case "close-account":
          window.location.href = `/app/pos?tableId=${encodeURIComponent(table.id)}`;
          break;
        case "reserve": {
          const result = await updateTable(table.id, {
            status: "reserved",
            reservedName: (data?.reservedName as string) || null,
          });
          setTables((prev) => prev.map((t) => (t.id === table.id ? result.data : t)));
          setMessage(
            `Mesa ${table.code} reservada${data?.reservedName ? ` para ${data.reservedName}` : ""}.`,
          );
          break;
        }
        case "cancel-reserve": {
          const result = await updateTable(table.id, {
            status: "free",
            reservedName: null,
          });
          setTables((prev) => prev.map((t) => (t.id === table.id ? result.data : t)));
          setMessage(`Reserva da mesa ${table.code} cancelada.`);
          break;
        }
        case "unmerge": {
          try {
            const result = await unmergeTables(table.id);
            setTables(result.data);
            setMessage(`Mesas separadas.`);
          } catch {
            setMessage("Erro ao separar mesas.");
          }
          break;
        }
      }
    },
    [],
  );

  // === Merge mode ===
  async function confirmMerge() {
    if (selectedTables.size < 2 || !branchId) return;
    try {
      const result = await mergeTables(branchId, Array.from(selectedTables));
      setTables(result.data);
      setMergeMode(false);
      setSelectedTables(new Set());
      setMessage(`${selectedTables.size} mesas juntadas com sucesso.`);
    } catch {
      setMessage("Erro ao juntar mesas.");
    }
  }

  function cancelMerge() {
    setMergeMode(false);
    setSelectedTables(new Set());
  }

  async function transitionServiceRequest(
    request: ServiceRequest,
    action: "acknowledge" | "resolve",
  ) {
    try {
      const updated =
        action === "acknowledge"
          ? await acknowledgeServiceRequest(request.id)
          : await resolveServiceRequest(request.id);
      setServiceRequests((current) =>
        action === "resolve"
          ? current.filter((item) => item.id !== request.id)
          : current.map((item) => (item.id === request.id ? updated : item)),
      );
      setMessage(
        action === "acknowledge"
          ? `Solicitação da ${request.tableName} reconhecida.`
          : `Solicitação da ${request.tableName} resolvida.`,
      );
    } catch {
      setMessage("A solicitação já foi tratada por outro operador. Atualizando a lista.");
      const rows = await listServiceRequests().catch(() => []);
      setServiceRequests(rows.filter((item) => ["pending", "acknowledged"].includes(item.status)));
    }
  }

  // === Group connectors ===
  function getGroupBounds(groupId: string) {
    const groupTables = tables.filter((t) => t.groupId === groupId);
    if (groupTables.length < 2) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    groupTables.forEach((table) => {
      const index = tables.findIndex((candidate) => candidate.id === table.id);
      const position = layout[table.id] ?? {
        x: (index % 4) * 24 + 4,
        y: Math.floor(index / 4) * 28 + 4,
      };
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x);
      maxY = Math.max(maxY, position.y);
    });
    return { minX, minY, maxX, maxY, color: groupColor(groupId) };
  }

  // Unique group IDs
  const groupIds = [...new Set(tables.map((t) => t.groupId).filter(Boolean))] as string[];
  const currentPopupGroup = popupTable?.groupId
    ? tables.filter((t) => t.groupId === popupTable.groupId)
    : undefined;

  return (
    <main
      className="salon-page"
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <header className="kds-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <div className="toolbar">
          <button
            className="button secondary compact"
            disabled={layoutHistory.length === 0}
            onClick={() => {
              const previous = layoutHistory.at(-1);
              if (!previous) return;
              setLayout(previous);
              setLayoutHistory((history) => history.slice(0, -1));
              setMessage("Última alteração de posição desfeita.");
            }}
            type="button"
          >
            <Undo2 size={16} /> Desfazer
          </button>
          <button
            className="button primary compact"
            disabled={!hasUnsavedChanges}
            onClick={() => void persist()}
            type="button"
          >
            <Save size={16} /> Salvar mapa
          </button>
          <a className="button secondary compact" href="/app/pos">
            Abrir PDV
          </a>
        </div>
      </header>

      <section className="salon-header">
        <span className="section-kicker">
          <LayoutGrid size={16} /> Salão
        </span>
        <h1>Mapa de mesas</h1>
        <p>{message}</p>
      </section>

      <section className="salon-tools">
        <form className="salon-create-form" onSubmit={submit}>
          <strong>
            <Plus size={15} /> Nova mesa
          </strong>
          <input
            value={form.code}
            onChange={(e) => setForm((c) => ({ ...c, code: e.target.value }))}
            placeholder="Código: M13"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            placeholder="Nome: Varanda 1"
          />
          <input
            value={form.seats}
            onChange={(e) => setForm((c) => ({ ...c, seats: e.target.value }))}
            inputMode="numeric"
            placeholder="Lugares"
          />
          <button className="button secondary compact" type="submit">
            Adicionar
          </button>
        </form>

        {mergeMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong
              style={{ color: "#f97316", display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              <Link2 size={15} /> Modo junção — {selectedTables.size} mesas selecionadas
            </strong>
            <button
              className="button primary compact"
              onClick={() => void confirmMerge()}
              disabled={selectedTables.size < 2}
              type="button"
            >
              Confirmar junção
            </button>
            <button className="button ghost compact" onClick={cancelMerge} type="button">
              <X size={14} /> Cancelar
            </button>
          </div>
        ) : (
          <div className="salon-legend">
            <span className="free">Livre</span>
            <span className="occupied">Em atendimento</span>
            <span className="preparing">Em preparo</span>
            <span className="payment">Pagamento</span>
            <button
              className="button ghost compact"
              onClick={() => setMergeMode(true)}
              type="button"
            >
              <Link2 size={14} /> Juntar mesas
            </button>
          </div>
        )}
      </section>

      {serviceRequests.length > 0 ? (
        <section className="salon-service-requests" aria-label="Chamados das mesas">
          {serviceRequests.map((request) => (
            <article key={request.id}>
              <div>
                <strong>{request.tableName}</strong>
                <span>
                  {request.type === "request_pre_bill"
                    ? "Solicitou pré-conta"
                    : request.type === "need_help"
                      ? "Precisa de ajuda"
                      : "Chamou o garçom"}
                </span>
              </div>
              {request.status === "pending" ? (
                <button
                  className="button secondary compact"
                  onClick={() => void transitionServiceRequest(request, "acknowledge")}
                  type="button"
                >
                  Reconhecer
                </button>
              ) : null}
              <button
                className="button primary compact"
                onClick={() => void transitionServiceRequest(request, "resolve")}
                type="button"
              >
                Resolver
              </button>
            </article>
          ))}
        </section>
      ) : null}

      <div
        ref={containerRef}
        aria-label="Mapa posicionável de mesas"
        role="application"
        className="salon-board salon-positioning-board"
        style={{
          position: "relative",
          overflow: "hidden",
          cursor: mergeMode ? "crosshair" : "grab",
          flex: 1,
          touchAction: "none",
        }}
        onWheel={handleWheel}
        onPointerDown={handlePanPointerDown}
        onPointerMove={(e) => {
          handlePanPointerMove(e);
          handleDragMove(e);
        }}
        onPointerUp={(e) => {
          handlePanPointerUp();
          handleDragUp(e);
        }}
        onPointerCancel={(e) => {
          handlePanPointerUp();
          handleDragUp(e);
        }}
        onDragOver={(event) => event.preventDefault()}
      >
        <div
          ref={worldRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "max(100%, 1200px)",
            height: "max(100%, 800px)",
            transformOrigin: "0 0",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {/* Group connectors */}
          {groupIds.map((gid) => {
            const bounds = getGroupBounds(gid);
            if (!bounds) return null;
            return (
              <div
                key={gid}
                style={{
                  position: "absolute",
                  left: `calc(${bounds.minX}% - 10px)`,
                  top: `calc(${bounds.minY}% - 10px)`,
                  width: `calc(${bounds.maxX - bounds.minX}% + ${TABLE_W + 20}px)`,
                  height: `calc(${bounds.maxY - bounds.minY}% + 120px)`,
                  border: `2px dashed ${bounds.color}`,
                  borderRadius: 14,
                  background: `${bounds.color}06`,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            );
          })}

          {/* Tables */}
          {tables.map((table, index) => {
            const x = layout[table.id]?.x ?? (index % 4) * 24 + 4;
            const y = layout[table.id]?.y ?? Math.floor(index / 4) * 28 + 4;
            const isSelected = selectedTables.has(table.id);
            const isDropTarget = dropTargetId === table.id;
            const gColor = table.groupId ? groupColor(table.groupId) : undefined;

            return (
              <button
                key={table.id}
                type="button"
                className={`salon-table salon-positioned ${tones[table.status] ?? "reserved"} ${isSelected ? "selected" : ""}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  borderColor: gColor,
                  boxShadow: isDropTarget
                    ? "0 0 0 3px #f97316, 0 0 0 6px #f9731640"
                    : table.groupId
                      ? `0 0 0 2px ${gColor}20`
                      : undefined,
                  outline: isSelected ? "3px solid #f97316" : undefined,
                  outlineOffset: isSelected ? "3px" : undefined,
                  opacity: draggingId === table.id ? 0.6 : 1,
                  transition: draggingId ? "none" : "opacity 150ms",
                }}
                onPointerDown={(e) => handleTablePointerDown(e, table)}
                onKeyDown={(event) => {
                  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
                    event.preventDefault();
                    const current = layout[table.id] ?? { x, y };
                    const next = {
                      x: Math.max(
                        0,
                        Math.min(
                          100,
                          current.x +
                            (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0),
                        ),
                      ),
                      y: Math.max(
                        0,
                        Math.min(
                          100,
                          current.y +
                            (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0),
                        ),
                      ),
                    };
                    setLayoutHistory((history) => [...history.slice(-19), layout]);
                    setLayout((currentLayout) => ({ ...currentLayout, [table.id]: next }));
                    setMessage(`Mesa ${table.code} reposicionada pelo teclado.`);
                    return;
                  }
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (mergeMode) {
                    setSelectedTables((current) => {
                      const next = new Set(current);
                      if (next.has(table.id)) next.delete(table.id);
                      else next.add(table.id);
                      return next;
                    });
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPopupTable(table);
                  setPopupPos({ x: rect.right + 8, y: rect.top });
                }}
              >
                <strong>{table.code}</strong>
                <span>{table.name}</span>
                <small>{table.seats} lugares</small>
                {table.groupId && (
                  <span
                    className="group-badge"
                    style={{
                      background: gColor,
                      position: "absolute",
                      top: -8,
                      right: -8,
                      padding: "2px 6px",
                      borderRadius: 4,
                      color: "#fff",
                      fontSize: "0.6rem",
                      fontWeight: 800,
                    }}
                  >
                    <Link2 size={10} /> Grupo
                  </span>
                )}
                {mergeMode && (
                  <span
                    className={`merge-checkbox ${isSelected ? "checked" : ""}`}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "2px solid var(--line)",
                      background: isSelected ? "#f97316" : "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      color: "#fff",
                    }}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                )}
                {table.reservedName && (
                  <small style={{ color: "#6b7280", fontStyle: "italic", fontSize: "0.7rem" }}>
                    {table.reservedName}
                  </small>
                )}
              </button>
            );
          })}
        </div>

        {/* Zoom controls */}
        <div
          className="salon-zoom-controls"
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            zIndex: 50,
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          <button
            className="button ghost compact"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            type="button"
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
              fontWeight: 700,
            }}
          >
            +
          </button>
          <div
            style={{
              textAlign: "center",
              fontSize: "0.7rem",
              color: "var(--muted)",
              padding: "2px 0",
              borderTop: "1px solid var(--line)",
            }}
          >
            {Math.round(scale * 100)}%
          </div>
          <button
            className="button ghost compact"
            onClick={() => setScale((s) => Math.max(0.3, s - 0.2))}
            type="button"
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
              fontWeight: 700,
            }}
          >
            −
          </button>
          <button
            className="button ghost compact"
            onClick={() => {
              setScale(1);
              setPan({ x: 0, y: 0 });
            }}
            type="button"
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
            }}
            title="Ajustar view"
          >
            [ ]
          </button>
        </div>
      </div>

      <FloorWorkspace
        tables={tables}
        onChanged={() => (branchId ? load(branchId) : Promise.resolve())}
      />

      {/* Popup */}
      {popupTable && (
        <TableActionPopup
          table={popupTable}
          {...(currentPopupGroup ? { groupTables: currentPopupGroup } : {})}
          position={popupPos}
          onClose={() => setPopupTable(null)}
          onAction={handlePopupAction}
        />
      )}
    </main>
  );
}
