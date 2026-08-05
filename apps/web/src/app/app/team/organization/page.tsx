"use client";

import { ArrowLeft, Copy, RefreshCw, Save, Shuffle, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assignWaiterTable,
  assignWaiterTablesBatch,
  buildPosEventsUrl,
  classifyOperationalDeltaBatch,
  copyPreviousWaiterShift,
  type DiningTable,
  type FloorArea,
  getSession,
  grantWaiterHelp,
  listFloorAreas,
  listTables,
  listUsers,
  listWaiterAssignments,
  listWaiterHelpRequests,
  type OperationalDeltaBatch,
  redistributeInactiveWaiterAssignments,
  type TenantUser,
  type WaiterAssignmentList,
  type WaiterHelpRequest,
} from "../../../../lib/giromesa-api";

function waiterName(users: TenantUser[], userId: string) {
  return users.find((user) => user.id === userId)?.name ?? "Operador indisponível";
}

export default function TeamOrganizationPage() {
  const [branchId, setBranchId] = useState("");
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [state, setState] = useState<WaiterAssignmentList>({ shift: null, assignments: [] });
  const [helpRequests, setHelpRequests] = useState<WaiterHelpRequest[]>([]);
  const [areas, setAreas] = useState<FloorArea[]>([]);
  const [areaId, setAreaId] = useState("");
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [tableId, setTableId] = useState("");
  const [waiterUserId, setWaiterUserId] = useState("");
  const [message, setMessage] = useState("Carregando a organização do atendimento...");
  const [managerPin, setManagerPin] = useState("");
  const [busy, setBusy] = useState(false);
  const realtimeVersion = useRef(0);

  const waiters = useMemo(
    () =>
      users.filter((user) => user.isActive && user.roles.some((role) => role.code === "waiter")),
    [users],
  );

  const refresh = useCallback(async () => {
    const session = await getSession();
    if (!session.branchId) throw new Error("Selecione uma filial antes de organizar as mesas.");
    const [nextTables, nextUsers, nextState, nextHelpRequests, nextAreas] = await Promise.all([
      listTables(session.branchId),
      listUsers(),
      listWaiterAssignments(session.branchId),
      listWaiterHelpRequests(session.branchId),
      listFloorAreas(),
    ]);
    setBranchId(session.branchId);
    setTables(nextTables.filter((table) => !table.archivedAt));
    setUsers(nextUsers);
    setState(nextState);
    setHelpRequests(nextHelpRequests);
    setAreas(nextAreas.filter((area) => area.branchId === session.branchId && area.isActive));
    setTableId((current) => current || nextTables[0]?.id || "");
    const nextWaiters = nextUsers.filter(
      (user) => user.isActive && user.roles.some((role) => role.code === "waiter"),
    );
    setWaiterUserId((current) => current || nextWaiters[0]?.id || "");
    setMessage(
      nextState.shift
        ? `${nextState.assignments.length} mesa(s) com responsável neste turno.`
        : "Abra o turno para distribuir as mesas da equipe.",
    );
  }, []);

  useEffect(() => {
    void refresh().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Falha ao carregar a organização."),
    );
  }, [refresh]);

  useEffect(() => {
    if (!branchId) return;
    let source: EventSource | null = null;
    let fallbackTimer: number | null = null;
    let refreshTimer: number | null = null;
    const recover = () => {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 250);
    };
    const startFallback = () => {
      if (fallbackTimer === null) fallbackTimer = window.setInterval(recover, 60_000);
    };
    try {
      source = new EventSource(buildPosEventsUrl(branchId), { withCredentials: true });
      source.addEventListener("pos.delta", (event) => {
        try {
          const batch = JSON.parse((event as MessageEvent<string>).data) as OperationalDeltaBatch;
          const classification = classifyOperationalDeltaBatch(realtimeVersion.current, batch);
          if (classification === "stale") return;
          realtimeVersion.current = batch.toVersion;
          if (classification === "gap") {
            recover();
            return;
          }
          setState((current) => applyWaiterDeltas(current, tables, users, batch));
          if (batch.deltas.some((delta) => delta.type.includes("help_"))) {
            void listWaiterHelpRequests(branchId).then(setHelpRequests);
          }
        } catch {
          recover();
        }
      });
      source.onerror = () => {
        source?.close();
        source = null;
        recover();
        startFallback();
      };
    } catch {
      startFallback();
    }
    return () => {
      source?.close();
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [branchId, refresh, tables, users]);

  async function saveAssignment() {
    if (!branchId || !tableId || !waiterUserId) {
      setMessage("Escolha uma mesa e um garçom.");
      return;
    }
    setBusy(true);
    try {
      const expectedVersion =
        state.assignments.find((row) => row.assignment.tableId === tableId)?.assignment.version ??
        0;
      await assignWaiterTable({
        branchId,
        tableId,
        waiterUserId,
        reason: "Distribuição do turno",
        expectedVersion,
      });
      await refresh();
      setMessage("Responsável atualizado com auditoria.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atribuir a mesa.");
    } finally {
      setBusy(false);
    }
  }

  async function assignBatch() {
    if (!branchId || !waiterUserId || (!areaId && selectedTableIds.size === 0)) {
      setMessage("Escolha um setor ou ao menos uma mesa para distribuir.");
      return;
    }
    setBusy(true);
    try {
      const tableIds = areaId
        ? tables.filter((table) => table.areaId === areaId).map((table) => table.id)
        : [...selectedTableIds];
      const result = await assignWaiterTablesBatch({
        branchId,
        waiterUserId,
        ...(areaId ? { areaId } : { tableIds }),
        expectedVersions: assignmentVersions(state, tableIds),
        reason: areaId ? "Distribuição do setor" : "Distribuição em lote",
      });
      setSelectedTableIds(new Set());
      await refresh();
      setMessage(`${result.count} mesa(s) distribuída(s) com versão confirmada.`);
    } catch (error) {
      await refresh().catch(() => undefined);
      setMessage(error instanceof Error ? error.message : "Falha na distribuição em lote.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPreviousShift() {
    setBusy(true);
    try {
      const result = await copyPreviousWaiterShift(branchId);
      await refresh();
      setMessage(`${result.copied.length} mesa(s) copiadas; ${result.skipped.length} preservadas.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao copiar o turno anterior.");
    } finally {
      setBusy(false);
    }
  }

  async function redistributeInactive() {
    const inactive = state.assignments.filter((row) => row.needsRedistribution);
    if (!waiterUserId || inactive.length === 0) {
      setMessage("Não há mesas de operador inativo para redistribuir.");
      return;
    }
    setBusy(true);
    try {
      const tableIds = inactive.map((row) => row.assignment.tableId);
      const result = await redistributeInactiveWaiterAssignments({
        branchId,
        waiterUserId,
        tableIds,
        expectedVersions: assignmentVersions(state, tableIds),
        reason: "Redistribuição de operador inativo",
      });
      await refresh();
      setMessage(`${result.count} mesa(s) redistribuída(s).`);
    } catch (error) {
      await refresh().catch(() => undefined);
      setMessage(error instanceof Error ? error.message : "Falha ao redistribuir mesas.");
    } finally {
      setBusy(false);
    }
  }

  async function grantHelp(requestId: string) {
    setBusy(true);
    try {
      if (!/^\d{4,8}$/.test(managerPin)) {
        setMessage("Informe o PIN gerencial para autorizar a ajuda.");
        return;
      }
      await grantWaiterHelp(requestId, managerPin);
      setManagerPin("");
      await refresh();
      setMessage("Ajuda pontual autorizada para o próximo lançamento.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível autorizar a ajuda.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="team-page">
      <header className="team-page-header">
        <a className="button ghost compact" href="/app/team">
          <ArrowLeft size={16} /> Equipe
        </a>
        <div>
          <span className="section-kicker">
            <Users size={16} /> Atendimento
          </span>
          <h1>Organização das mesas</h1>
          <p>{message}</p>
        </div>
        <button className="button secondary compact" onClick={() => void refresh()} type="button">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      <section className="team-page-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Abertura do turno</span>
              <h2>Organização em lote</h2>
            </div>
          </div>
          <div className="team-form stacked">
            <label>
              Setor opcional
              <select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
                <option value="">Usar mesas selecionadas</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="team-list">
              {tables.map((table) => (
                <label className="team-row" key={table.id}>
                  <input
                    checked={selectedTableIds.has(table.id)}
                    disabled={Boolean(areaId)}
                    onChange={(event) =>
                      setSelectedTableIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(table.id);
                        else next.delete(table.id);
                        return next;
                      })
                    }
                    type="checkbox"
                  />
                  <span>
                    {table.code} · {table.name}
                  </span>
                </label>
              ))}
            </div>
            <button
              className="button primary"
              disabled={busy || !state.shift}
              onClick={() => void assignBatch()}
              type="button"
            >
              <Save size={16} /> Distribuir lote
            </button>
            <button
              className="button secondary"
              disabled={busy || !state.shift}
              onClick={() => void copyPreviousShift()}
              type="button"
            >
              <Copy size={16} /> Copiar turno anterior
            </button>
            <button
              className="button secondary"
              disabled={busy || !state.assignments.some((row) => row.needsRedistribution)}
              onClick={() => void redistributeInactive()}
              type="button"
            >
              <Shuffle size={16} /> Redistribuir inativos
            </button>
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Distribuição rápida</span>
              <h2>Definir responsável</h2>
            </div>
          </div>
          <p className="muted-copy">
            O responsável acompanha a mesa no turno. Trocas preservam quem lançou cada item.
          </p>
          <div className="team-form stacked">
            <label>
              Mesa
              <select value={tableId} onChange={(event) => setTableId(event.target.value)}>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.code} · {table.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Garçom responsável
              <select
                value={waiterUserId}
                onChange={(event) => setWaiterUserId(event.target.value)}
              >
                {waiters.map((waiter) => (
                  <option key={waiter.id} value={waiter.id}>
                    {waiter.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button primary"
              disabled={busy || !state.shift || !tableId || !waiterUserId}
              onClick={() => void saveAssignment()}
              type="button"
            >
              <Save size={16} /> Salvar responsável
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Turno atual</span>
              <h2>Mesas distribuídas</h2>
            </div>
            <span className="count-chip">{state.assignments.length}</span>
          </div>
          <div className="team-list">
            {state.assignments.map((row) => (
              <div className="team-row" key={row.assignment.id}>
                <div>
                  <strong>
                    {row.tableCode} · {row.tableName}
                  </strong>
                  <span>{waiterName(users, row.assignment.waiterUserId)}</span>
                  {row.needsRedistribution ? <span>Requer redistribuição</span> : null}
                </div>
                <small>
                  {row.assignment.source === "first_service"
                    ? "Assumida no atendimento"
                    : "Distribuída pela gestão"}
                </small>
              </div>
            ))}
            {state.assignments.length === 0 ? (
              <p className="muted-copy">Nenhuma mesa distribuída neste turno.</p>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Apoio pontual</span>
              <h2>Pedidos de ajuda</h2>
            </div>
            <span className="count-chip">{helpRequests.length}</span>
          </div>
          <div className="team-list">
            {helpRequests.length > 0 ? (
              <label className="platform-search">
                PIN gerencial
                <input
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={8}
                  onChange={(event) => setManagerPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  value={managerPin}
                />
              </label>
            ) : null}
            {helpRequests.map((request) => (
              <div className="team-row" key={request.id}>
                <div>
                  <strong>
                    {request.tableCode} · {request.tableName}
                  </strong>
                  <span>{request.reason}</span>
                </div>
                <button
                  className="button secondary compact"
                  disabled={busy}
                  onClick={() => void grantHelp(request.id)}
                  type="button"
                >
                  Autorizar um lançamento
                </button>
              </div>
            ))}
            {helpRequests.length === 0 ? (
              <p className="muted-copy">Nenhum pedido de ajuda aguardando autorização.</p>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}

function assignmentVersions(state: WaiterAssignmentList, tableIds: string[]) {
  return Object.fromEntries(
    tableIds.map((id) => [
      id,
      state.assignments.find((row) => row.assignment.tableId === id)?.assignment.version ?? 0,
    ]),
  );
}

function applyWaiterDeltas(
  current: WaiterAssignmentList,
  tables: DiningTable[],
  users: TenantUser[],
  batch: OperationalDeltaBatch,
): WaiterAssignmentList {
  if (!current.shift) return current;
  let assignments = current.assignments;
  for (const delta of batch.deltas) {
    if (delta.type !== "waiter_assignment.created" || !delta.refs.tableId) continue;
    const waiterUserId =
      typeof delta.data.waiterUserId === "string" ? delta.data.waiterUserId : null;
    const version =
      typeof delta.data.assignmentVersion === "number" ? delta.data.assignmentVersion : null;
    const source = delta.data.source;
    const table = tables.find((item) => item.id === delta.refs.tableId);
    const waiter = users.find((item) => item.id === waiterUserId);
    if (
      !waiterUserId ||
      !version ||
      !table ||
      !["manager", "area", "first_service", "transfer"].includes(String(source))
    )
      continue;
    assignments = [
      ...assignments.filter((row) => row.assignment.tableId !== table.id),
      {
        assignment: {
          id: delta.aggregate.id,
          branchId: batch.branchId,
          shiftId: current.shift.id,
          tableId: table.id,
          waiterUserId,
          source: source as WaiterAssignmentList["assignments"][number]["assignment"]["source"],
          assignedAt: delta.occurredAt,
          endedAt: null,
          version,
        },
        tableCode: table.code,
        tableName: table.name,
        waiterName: waiter?.name ?? "Operador indisponível",
        waiterIsActive: waiter?.isActive ?? false,
        needsRedistribution: !(waiter?.isActive ?? false),
      },
    ];
  }
  return { ...current, assignments };
}
