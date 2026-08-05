"use client";
import { Edit3, LayoutGrid, Link2, MousePointer2, Plus, Save, Undo2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrandLink } from "../../../components/app-shell/BrandMark";
import { FloorWorkspace } from "../../../features/floor/FloorWorkspace";
import { arrangeTablesForMerge, moveTablesInLayout } from "../../../features/floor/salon-layout";
import { TableActionPopup } from "../../../features/floor/TableActionPopup";
import {
  acknowledgeServiceRequest,
  activateQrTableService,
  approveQrPresenceApproval,
  buildPosEventsUrl,
  createDiningTable,
  createFloorArea,
  type DiningTable,
  getFloorPlan,
  getSession,
  listFloorAreas,
  listQrPresenceApprovals,
  listServiceRequests,
  listTables,
  mergeTables,
  type QrPresenceApproval,
  replayOperationalMutation,
  resolveServiceRequest,
  type ServiceRequest,
  saveFloorPlan,
  unmergeTables,
  updateFloorArea,
  updateTable,
} from "../../../lib/giromesa-api";
import {
  createOperationalOutbox,
  createOperationIdempotencyKey,
  executeOperationalCommand,
  reconcileOperationalOutbox,
} from "../../../lib/operational-outbox";

type Position = { x: number; y: number };
const TABLE_W = 175;
const TABLE_H = 136;
const TABLE_GAP = 12;
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
  cleaning: "free",
};

export default function SalonPage() {
  // Preserve the existing map contract: editing is the safe default; operators can switch modes explicitly.
  const [mode, setMode] = useState<"operation" | "edit">("edit");
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [branchId, setBranchId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [layout, setLayout] = useState<Record<string, Position>>({});
  const [savedLayout, setSavedLayout] = useState<Record<string, Position>>({});
  const [layoutHistory, setLayoutHistory] = useState<Array<Record<string, Position>>>([]);
  const [planVersion, setPlanVersion] = useState(0);
  const [message, setMessage] = useState("Carregando mapa do salão...");
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [presenceApprovals, setPresenceApprovals] = useState<QrPresenceApproval[]>([]);
  const [areas, setAreas] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const [areaName, setAreaName] = useState("");
  const [form, setForm] = useState({
    code: "",
    name: "",
    seats: "4",
    shape: "rounded",
    areaId: "",
  });

  // Canvas state
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
  const [mergeSuggestion, setMergeSuggestion] = useState<[string, string] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Pan state
  const panRef = useRef({ isPanning: false, startX: 0, startY: 0 });
  const panFrameRef = useRef<number | null>(null);
  const panPointRef = useRef({ x: 0, y: 0 });

  const load = useCallback(async (id: string) => {
    const [rows, plan, areaRows] = await Promise.all([
      listTables(id),
      getFloorPlan(id),
      listFloorAreas(),
    ]);
    setTables(rows);
    setAreas(areaRows.filter((area) => area.isActive));
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
        setTenantId(session.tenantId);
        setBranchId(session.branchId);
        await load(session.branchId);
        setMessage("Arraste as mesas para organizar o salão e salve a disposição.");
      } catch {
        setMessage("Entre com um perfil operacional para carregar o mapa real.");
      }
    })();
  }, [load]);

  useEffect(() => {
    if (!tenantId || !branchId || !window.navigator.onLine) return;
    const outbox = createOperationalOutbox({ tenantId, branchId });
    void reconcileOperationalOutbox(outbox, replayOperationalMutation).then((summary) => {
      if (summary.confirmed > 0) {
        setMessage(`${summary.confirmed} alteração(ões) do salão reconciliada(s).`);
        void load(branchId);
      }
    });
  }, [branchId, load, tenantId]);

  const runSalonCommand = useCallback(
    async <T extends Record<string, unknown>>(
      input: Parameters<ReturnType<typeof createOperationalOutbox>["enqueue"]>[0],
      send: () => Promise<T>,
    ) => {
      if (!tenantId || !branchId) throw new Error("Sessão operacional indisponível.");
      const outbox = createOperationalOutbox({ tenantId, branchId });
      const execution = await executeOperationalCommand(outbox, input, () => send());
      if (!execution.result) throw new Error("Alteração já confirmada. Atualize o salão.");
      return execution.result;
    },
    [branchId, tenantId],
  );

  const mutateTable = useCallback(
    (tableId: string, data: Parameters<typeof updateTable>[1]) =>
      runSalonCommand(
        {
          idempotencyKey: createOperationIdempotencyKey("update-table"),
          operation: "update_table",
          method: "PATCH",
          path: `/api/v1/pos/tables/${tableId}`,
          payload: data,
        },
        () => updateTable(tableId, data),
      ),
    [runSalonCommand],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearInterval(timer);
      if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    const refreshRequests = () =>
      void Promise.all([listServiceRequests(), listQrPresenceApprovals()])
        .then(([rows, approvals]) => {
          setServiceRequests(
            rows.filter((request) => ["pending", "acknowledged"].includes(request.status)),
          );
          setPresenceApprovals(approvals);
        })
        .catch(() => undefined);
    refreshRequests();
    const interval = window.setInterval(refreshRequests, 15_000);
    return () => window.clearInterval(interval);
  }, [branchId]);

  async function approvePresence(request: QrPresenceApproval) {
    try {
      await approveQrPresenceApproval(request.id);
      setPresenceApprovals((current) => current.filter((item) => item.id !== request.id));
      setMessage(`Presença confirmada para a ${request.tableCode}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível confirmar a presença.");
    }
  }

  useEffect(() => {
    if (!branchId) return;
    let stopped = false;
    let events: EventSource | null = null;
    let retry: number | undefined;
    const connect = () => {
      if (stopped) return;
      events = new EventSource(buildPosEventsUrl(branchId), { withCredentials: true });
      events.onmessage = () => void load(branchId).catch(() => undefined);
      events.onerror = () => {
        events?.close();
        events = null;
        if (!stopped) retry = window.setTimeout(connect, 5_000);
      };
    };
    retry = window.setTimeout(connect, 1_500);
    return () => {
      stopped = true;
      events?.close();
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [branchId, load]);

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
      const payload = { branchId, layout, expectedVersion: planVersion };
      const saved = await runSalonCommand(
        {
          idempotencyKey: createOperationIdempotencyKey("floor-plan"),
          operation: "save_floor_plan",
          method: "PATCH",
          path: "/api/v1/pos/floor-plan",
          payload,
        },
        () => saveFloorPlan(branchId, layout, planVersion),
      );
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
        shape: form.shape as "rounded" | "square" | "circle" | "booth",
        ...(form.areaId ? { areaId: form.areaId } : {}),
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
      setForm({ code: "", name: "", seats: "4", shape: "rounded", areaId: "" });
      setMessage("Mesa criada. Posicione-a e salve o mapa.");
    } catch {
      setMessage("Não foi possível criar a mesa. Verifique código, nome e capacidade.");
    }
  }

  async function addArea() {
    if (!areaName.trim()) return;
    try {
      const area = await createFloorArea({ name: areaName.trim(), sortOrder: areas.length });
      setAreas((current) => [...current, area]);
      setAreaName("");
      setMessage(`Setor ${area.name} criado.`);
    } catch {
      setMessage("Não foi possível criar o setor.");
    }
  }

  async function archiveArea(areaId: string) {
    try {
      await updateFloorArea(areaId, { isActive: false });
      setAreas((current) => current.filter((area) => area.id !== areaId));
      setMessage("Setor arquivado. As mesas existentes foram preservadas.");
    } catch {
      setMessage("Não foi possível arquivar o setor.");
    }
  }

  async function restoreTable(table: DiningTable) {
    try {
      const result = await mutateTable(table.id, { archived: false, status: "free" });
      setTables((current) => current.map((item) => (item.id === table.id ? result.data : item)));
      setMessage(`Mesa ${table.code} restaurada no mapa.`);
    } catch {
      setMessage("Não foi possível restaurar a mesa.");
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
    panPointRef.current = { x: e.clientX, y: e.clientY };
    if (panFrameRef.current !== null) return;
    panFrameRef.current = requestAnimationFrame(() => {
      panFrameRef.current = null;
      setPan({
        x: panPointRef.current.x - panRef.current.startX,
        y: panPointRef.current.y - panRef.current.startY,
      });
    });
  }, []);

  const handlePanPointerUp = useCallback(() => {
    panRef.current.isPanning = false;
  }, []);

  // === Table drag ===
  const CLICK_THRESHOLD = 10;

  function handleTablePointerDown(e: React.PointerEvent<HTMLButtonElement>, table: DiningTable) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (mode === "operation") {
      const rect = e.currentTarget.getBoundingClientRect();
      setPopupTable(table);
      setPopupPos({ x: rect.right + 8, y: rect.top });
      return;
    }

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
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
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

      setLayout((currentLayout) =>
        moveTablesInLayout(currentLayout, tables, draggingId, delta, {
          maxX: Math.max(0, 100 - (TABLE_W / board.clientWidth) * 100),
          maxY: Math.max(0, 100 - (TABLE_H / board.clientHeight) * 100),
        }),
      );
    },
    [draggingId, scale, tables],
  );

  const arrangeAndPersistMergedTables = useCallback(
    async (tableIds: string[], successMessage: string) => {
      const board = containerRef.current;
      if (!board || !branchId) return;
      const nextLayout = arrangeTablesForMerge(layout, tableIds, {
        width: board.clientWidth,
        height: board.clientHeight,
        tableWidth: TABLE_W,
        tableHeight: TABLE_H,
        gap: TABLE_GAP,
      });
      setLayoutHistory((history) => [...history.slice(-19), layout]);
      setLayout(nextLayout);

      try {
        const saved = await saveFloorPlan(branchId, nextLayout, planVersion);
        setPlanVersion(saved.version);
        setSavedLayout(nextLayout);
        setLayoutHistory([]);
        setMessage(successMessage);
      } catch {
        setMessage(`${successMessage} A posição ficou pendente; use “Salvar mapa”.`);
      }
    },
    [branchId, layout, planVersion],
  );

  const handleDragUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!draggingId) return;
      const wasClick = !dragRef.current.wasDrag;
      const tableId = dragRef.current.tableId;

      setDraggingId(null);

      if (wasClick) {
        setLayoutHistory((history) => history.slice(0, -1));
        // Click - show popup
        const table = tables.find((t) => t.id === tableId);
        if (table) {
          const rect = e.currentTarget.getBoundingClientRect();
          setPopupTable(table);
          setPopupPos({ x: rect.right + 8, y: rect.top });
        }
        return;
      }

      const draggedPosition = layout[tableId];
      if (!draggedPosition) return;
      const nearby = tables.find((candidate) => {
        if (candidate.id === tableId) return false;
        const position = layout[candidate.id];
        if (!position) return false;
        return (
          Math.abs(position.x - draggedPosition.x) <= 8 &&
          Math.abs(position.y - draggedPosition.y) <= 8
        );
      });
      if (nearby) {
        setMergeSuggestion([tableId, nearby.id]);
        setMessage(
          `Mesas próximas: ${tables.find((table) => table.id === tableId)?.code ?? ""} e ${nearby.code}.`,
        );
      }
    },
    [draggingId, layout, tables],
  );

  const handleDragCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setDraggingId(null);
  }, []);

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
        case "activate-qr": {
          try {
            const session = await runSalonCommand(
              {
                idempotencyKey: createOperationIdempotencyKey("activate-table-qr"),
                operation: "activate_table_qr",
                method: "POST",
                path: `/api/v1/qr/tables/${table.id}/service-session`,
                payload: {},
                replayable: false,
              },
              () => activateQrTableService(table.id),
            );
            setMessage(
              `QR da ${table.code} ativo. Código do cliente: ${session.code} (válido até ${new Date(session.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}).`,
            );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Não foi possível ativar o QR.");
          }
          break;
        }
        case "reserve": {
          const result = await mutateTable(table.id, {
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
          const result = await mutateTable(table.id, {
            status: "free",
            reservedName: null,
          });
          setTables((prev) => prev.map((t) => (t.id === table.id ? result.data : t)));
          setMessage(`Reserva da mesa ${table.code} cancelada.`);
          break;
        }
        case "edit-table": {
          try {
            const result = await mutateTable(table.id, {
              seats: Number(data?.seats),
              shape: (data?.shape as "rounded" | "square" | "circle" | "booth") ?? "rounded",
            });
            setTables((prev) => prev.map((item) => (item.id === table.id ? result.data : item)));
            setMessage(`Mesa ${table.code} atualizada.`);
          } catch {
            setMessage("Não foi possível atualizar a mesa.");
          }
          break;
        }
        case "block-table":
        case "unblock-table": {
          try {
            const result = await mutateTable(table.id, {
              status: action === "block-table" ? "blocked" : "free",
            });
            setTables((prev) => prev.map((item) => (item.id === table.id ? result.data : item)));
            setMessage(
              action === "block-table"
                ? `Mesa ${table.code} bloqueada.`
                : `Mesa ${table.code} liberada.`,
            );
          } catch {
            setMessage("Não foi possível alterar o bloqueio da mesa.");
          }
          break;
        }
        case "archive-table": {
          try {
            const result = await mutateTable(table.id, { archived: true });
            setTables((prev) => prev.map((item) => (item.id === table.id ? result.data : item)));
            setMessage(`Mesa ${table.code} arquivada.`);
          } catch {
            setMessage("Mesa com atendimento aberto não pode ser arquivada.");
          }
          break;
        }
        case "mark-cleaning": {
          const result = await mutateTable(table.id, { status: "cleaning" });
          setTables((prev) => prev.map((item) => (item.id === table.id ? result.data : item)));
          setMessage(`Mesa ${table.code} marcada como a limpar.`);
          break;
        }
        case "release-table": {
          const result = await mutateTable(table.id, { status: "free", reservedName: null });
          setTables((prev) => prev.map((item) => (item.id === table.id ? result.data : item)));
          setMessage(`Mesa ${table.code} liberada.`);
          break;
        }
        case "unmerge": {
          try {
            const groupTableIds = table.groupId
              ? tables
                  .filter((candidate) => candidate.groupId === table.groupId)
                  .map((candidate) => candidate.id)
              : [];
            const idempotencyKey = createOperationIdempotencyKey("unmerge-tables");
            const result = await runSalonCommand(
              {
                idempotencyKey,
                operation: "unmerge_tables",
                method: "DELETE",
                path: `/api/v1/pos/unmerge-tables/${table.id}`,
                payload: {},
              },
              () => unmergeTables(table.id),
            );
            setTables(result.data);
            if (groupTableIds.length > 1) {
              const nextLayout = { ...layout };
              groupTableIds.forEach((tableId, index) => {
                const current = nextLayout[tableId] ?? { x: 4, y: 4 };
                nextLayout[tableId] = {
                  x: Math.min(88, current.x + (index % 2) * 12),
                  y: Math.min(84, current.y + Math.floor(index / 2) * 18),
                };
              });
              setLayoutHistory((history) => [...history.slice(-19), layout]);
              setLayout(nextLayout);
              setMessage("Mesas separadas e reposicionadas. Salve o mapa para confirmar.");
            } else {
              setMessage("Mesas separadas.");
            }
          } catch {
            setMessage("Erro ao separar mesas.");
          }
          break;
        }
      }
    },
    [layout, mutateTable, runSalonCommand, tables],
  );

  // === Merge mode ===
  async function confirmMerge() {
    if (selectedTables.size < 2 || !branchId) return;
    try {
      const tableIds = Array.from(selectedTables);
      const payload = { branchId, tableIds };
      const result = await runSalonCommand(
        {
          idempotencyKey: createOperationIdempotencyKey("merge-tables"),
          operation: "merge_tables",
          method: "POST",
          path: "/api/v1/pos/merge-tables",
          payload,
        },
        () => mergeTables(branchId, tableIds),
      );
      setTables(result.data);
      setMergeMode(false);
      setSelectedTables(new Set());
      await arrangeAndPersistMergedTables(
        tableIds,
        `${tableIds.length} mesas juntadas, alinhadas e salvas.`,
      );
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
      style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}
    >
      <header className="kds-topbar">
        <BrandLink />
        <div className="toolbar">
          <button
            className="button secondary compact"
            onClick={() => {
              setMergeSuggestion(null);
              setMergeMode(false);
              setSelectedTables(new Set());
              setMode((current) => (current === "edit" ? "operation" : "edit"));
              setMessage(
                mode === "edit"
                  ? "Modo operação: clique numa mesa para abrir suas ações."
                  : "Modo edição: arraste mesas e salve a disposição.",
              );
            }}
            type="button"
          >
            {mode === "edit" ? <MousePointer2 size={16} /> : <Edit3 size={16} />}
            {mode === "edit" ? "Operar salão" : "Editar mapa"}
          </button>
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
        {mode === "edit" ? (
          <form className="salon-create-form" onSubmit={submit}>
            <strong>
              <Plus size={15} /> Nova mesa
            </strong>
            <input
              aria-label="Código da nova mesa"
              value={form.code}
              onChange={(e) => setForm((c) => ({ ...c, code: e.target.value }))}
              placeholder="Código: M13"
            />
            <input
              aria-label="Nome da nova mesa"
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              placeholder="Nome: Varanda 1"
            />
            <input
              aria-label="Quantidade de lugares da nova mesa"
              value={form.seats}
              onChange={(e) => setForm((c) => ({ ...c, seats: e.target.value }))}
              inputMode="numeric"
              placeholder="Lugares"
            />
            <select
              value={form.shape}
              aria-label="Formato da mesa"
              onChange={(e) => setForm((c) => ({ ...c, shape: e.target.value }))}
            >
              <option value="rounded">Redonda</option>
              <option value="square">Quadrada</option>
              <option value="circle">Circular</option>
              <option value="booth">Bancada</option>
            </select>
            <select
              value={form.areaId}
              aria-label="Setor da mesa"
              onChange={(e) => setForm((c) => ({ ...c, areaId: e.target.value }))}
            >
              <option value="">Sem setor</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
            <button className="button secondary compact" type="submit">
              Adicionar
            </button>
            <div className="salon-area-form">
              <input
                aria-label="Nome do novo setor"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="Novo setor"
              />
              <button className="button ghost compact" type="button" onClick={() => void addArea()}>
                <Plus size={14} /> Setor
              </button>
            </div>
            {areas.length > 0 ? (
              <div className="salon-area-list">
                {areas.map((area) => (
                  <span key={area.id} className="salon-area-chip">
                    {area.name}
                    <button
                      aria-label={`Arquivar setor ${area.name}`}
                      className="button ghost compact"
                      onClick={() => void archiveArea(area.id)}
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </form>
        ) : (
          <p className="salon-operation-hint">
            Modo operação: clique numa mesa para atender sem sair do mapa.
          </p>
        )}

        {mode === "edit" && mergeMode ? (
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
        ) : mode === "edit" ? (
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
        ) : null}
      </section>

      {mergeSuggestion ? (
        <section className="salon-merge-suggestion" aria-label="Sugestão de junção">
          <span>Mesas próximas detectadas. Deseja juntá-las?</span>
          <button
            className="button primary compact"
            type="button"
            onClick={() => {
              setSelectedTables(new Set(mergeSuggestion));
              setMergeSuggestion(null);
              setMergeMode(true);
            }}
          >
            Revisar junção
          </button>
          <button
            className="button ghost compact"
            type="button"
            onClick={() => setMergeSuggestion(null)}
          >
            Agora não
          </button>
        </section>
      ) : null}

      {mode === "edit" && tables.some((table) => table.archivedAt) ? (
        <section className="salon-archived-tables" aria-label="Mesas arquivadas">
          <strong>Mesas arquivadas</strong>
          {tables
            .filter((table) => table.archivedAt)
            .map((table) => (
              <span key={table.id} className="salon-area-chip">
                {table.code} · {table.name}
                <button
                  className="button ghost compact"
                  onClick={() => void restoreTable(table)}
                  type="button"
                >
                  Restaurar
                </button>
              </span>
            ))}
        </section>
      ) : null}

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
                {request.assignedWaiterName ? (
                  <span>Responsável: {request.assignedWaiterName}</span>
                ) : null}
                {request.attention === "escalated" ? (
                  <span className="status attention">Atenção: excedeu o prazo</span>
                ) : null}
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

      {presenceApprovals.length > 0 ? (
        <section className="salon-service-requests" aria-label="Confirmações de presença pelo QR">
          {presenceApprovals.map((request) => (
            <article key={request.id}>
              <div>
                <strong>
                  {request.tableCode} · {request.tableName}
                </strong>
                <span>Cliente aguardando confirmação para usar o QR</span>
              </div>
              <button
                className="button primary compact"
                onClick={() => void approvePresence(request)}
                type="button"
              >
                Confirmar presença
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
        onPointerMove={handlePanPointerMove}
        onPointerUp={handlePanPointerUp}
        onPointerCancel={handlePanPointerUp}
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
          {tables
            .filter((table) => !table.archivedAt)
            .map((table, index) => {
              const x = layout[table.id]?.x ?? (index % 4) * 24 + 4;
              const y = layout[table.id]?.y ?? Math.floor(index / 4) * 28 + 4;
              const isSelected = selectedTables.has(table.id);
              const gColor = table.groupId ? groupColor(table.groupId) : undefined;

              return (
                <button
                  key={table.id}
                  type="button"
                  data-table-id={table.id}
                  className={`salon-table salon-positioned ${tones[table.status] ?? "reserved"} ${isSelected ? "selected" : ""}`}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    borderColor: gColor,
                    boxShadow: table.groupId ? `0 0 0 2px ${gColor}20` : undefined,
                    outline: isSelected ? "3px solid #f97316" : undefined,
                    outlineOffset: isSelected ? "3px" : undefined,
                    opacity: draggingId === table.id ? 0.6 : 1,
                    transition: draggingId ? "none" : "opacity 150ms",
                    borderRadius:
                      table.shape === "circle"
                        ? "50%"
                        : table.shape === "square"
                          ? 8
                          : table.shape === "booth"
                            ? 4
                            : 16,
                  }}
                  onPointerDown={(e) => handleTablePointerDown(e, table)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragUp}
                  onPointerCancel={handleDragCancel}
                  onKeyDown={(event) => {
                    if (mode !== "edit") return;
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
                  {table.activeOrder?.openedAt ? (
                    <small>
                      Atendimento há{" "}
                      {Math.max(
                        0,
                        Math.floor((now - new Date(table.activeOrder.openedAt).getTime()) / 60_000),
                      )}{" "}
                      min
                    </small>
                  ) : null}
                  {table.reservation ? (
                    <small>Reserva: {table.reservation.customerName}</small>
                  ) : null}
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
                        color: "#07111b",
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
            background: "var(--surface)",
            borderRadius: 10,
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          <button
            className="button ghost compact"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            aria-label="Aumentar zoom"
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
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setScale((s) => Math.max(0.3, s - 0.2))}
            aria-label="Diminuir zoom"
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
            onPointerDown={(event) => event.stopPropagation()}
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
            title="Ajustar mapa"
            aria-label="Ajustar mapa"
          >
            Ajustar
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
