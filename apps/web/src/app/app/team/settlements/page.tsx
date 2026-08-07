"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Download,
  Eye,
  HandCoins,
  Printer,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { readOperationalStatusLabel } from "../../../../lib/formatters/app-dashboard";
import { apiRequest, getSession, listUsers } from "../../../../lib/giromesa-api";

type Settlement = {
  id: string;
  waiterUserId: string;
  status: string;
  netConsumptionCents: number;
  serviceReceivedCents: number;
  pendingCashCents: number;
  calculatedAt?: string;
  ledgerHash?: string;
  breakdown?: Record<string, unknown>;
  policySnapshot?: { requireWaiterConfirmation?: boolean };
  version: number;
};
type Managerial = Omit<Settlement, "waiterUserId">;
type Occurrence = {
  id: string;
  orderId: string | null;
  type: string;
  status: string;
  unpaidBalanceCents: number;
  decision: string | null;
  version: number;
  createdAt: string;
};
type OccurrenceEvent = {
  id: string;
  occurrenceId: string;
  eventType: string;
  amountCents: number;
  reversesEventId: string | null;
};
type OpenOrder = {
  id: string;
  tableId: string | null;
  channel: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  serviceChargeSuggestedCents: number;
  serviceChargeCents: number;
  serviceChargeStatus: string;
  totalCents: number;
  version: number;
};
type ServicePolicy = {
  id: string;
  attributionMode: "table_responsible" | "item_author" | "shift_pool";
  serviceRateBps: number;
  serviceBase: "net_consumption" | "gross_consumption" | "manual";
  requireWaiterConfirmation: boolean;
  poolRules: Record<string, unknown>;
  version: number;
};
type Policy = { id: string; name: string; status: string; model: string; version: number };
type FinancialReport = {
  projectionHash: string;
  totals: {
    grossSalesCents: number;
    cancelledCents: number;
    discountCents: number;
    netConsumptionCents: number;
    serviceSuggestedCents: number;
    serviceReceivedCents: number;
    pendingCashCents: number;
    unassignedNetCents: number;
    openLossCents: number;
    recoveredCents: number;
    approvedCommissionCents: number;
    informedCommissionPaidCents: number;
  };
  totalEntries?: Array<{ key: string; label: string; valueCents: number }>;
};
type Accrual = {
  id: string;
  userId: string;
  policyId: string;
  status: string;
  calculatedCents: number;
  approvedCents: number;
  paidCents: number;
  version: number;
};
type Payment = {
  id: string;
  accrualId: string;
  amountCents: number;
  method: string;
  reversesRecordId: string | null;
};
type User = { id: string; name: string; email: string };
type PrinterDevice = { id: string; name: string; isActive: boolean };

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const key = () => crypto.randomUUID();
const cents = (value: FormDataEntryValue | null) =>
  Math.round(Number(String(value ?? "0").replace(",", ".")) * 100);
const legalNotice =
  "Documento informativo. O GiroMesa não realiza desconto salarial, folha de pagamento ou transferência bancária. A decisão e a conferência são do estabelecimento.";

export default function TeamSettlementsPage() {
  const [tab, setTab] = useState<"shift" | "occurrences" | "partnerships">("shift");
  const [shiftId, setShiftId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [managerial, setManagerial] = useState<Managerial | null>(null);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [events, setEvents] = useState<OccurrenceEvent[]>([]);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [servicePolicy, setServicePolicy] = useState<ServicePolicy | null>(null);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [detail, setDetail] = useState<Settlement | null>(null);
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [status, setStatus] = useState("Carregando fechamento da equipe…");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const session = await getSession();
    const activeBranch = session.branchId ?? "";
    setBranchId(activeBranch);
    const current = activeBranch
      ? await apiRequest<{ shift: { id: string } | null }>(
          `/api/v1/pos/shift/current?branchId=${encodeURIComponent(activeBranch)}`,
        )
      : { shift: null };
    const activeShiftId = current.shift?.id ?? "";
    setShiftId(activeShiftId);
    const [
      settlementResult,
      occurrenceResult,
      orderResult,
      policyResult,
      accrualResult,
      paymentResult,
      userResult,
      servicePolicyResult,
      reportResult,
      printerResult,
    ] = await Promise.all([
      activeShiftId
        ? apiRequest<{ data: Settlement[]; managerial: Managerial | null }>(
            `/api/v1/staff-finance/shifts/${activeShiftId}/settlements`,
          )
        : Promise.resolve({ data: [], managerial: null }),
      activeBranch
        ? apiRequest<{ data: Occurrence[] }>(
            `/api/v1/staff-finance/occurrences?branchId=${encodeURIComponent(activeBranch)}`,
          )
        : Promise.resolve({ data: [] }),
      activeBranch
        ? apiRequest<{ data: OpenOrder[] }>(
            `/api/v1/staff-finance/open-orders?branchId=${encodeURIComponent(activeBranch)}`,
          )
        : Promise.resolve({ data: [] }),
      activeBranch
        ? apiRequest<{ data: Policy[] }>(
            `/api/v1/staff-finance/commission-policies?branchId=${encodeURIComponent(activeBranch)}`,
          )
        : Promise.resolve({ data: [] }),
      activeBranch
        ? apiRequest<{ data: Accrual[] }>(
            `/api/v1/staff-finance/commission-accruals?branchId=${encodeURIComponent(activeBranch)}`,
          )
        : Promise.resolve({ data: [] }),
      activeBranch
        ? apiRequest<{ data: Payment[] }>(
            `/api/v1/staff-finance/commission-payment-records?branchId=${encodeURIComponent(activeBranch)}`,
          )
        : Promise.resolve({ data: [] }),
      listUsers().catch(() => []),
      activeBranch
        ? apiRequest<ServicePolicy | null>(
            `/api/v1/staff-finance/service-policy?branchId=${encodeURIComponent(activeBranch)}`,
          )
        : Promise.resolve(null),
      activeBranch
        ? apiRequest<FinancialReport>(
            `/api/v1/staff-finance/reports/financial?branchId=${encodeURIComponent(activeBranch)}${activeShiftId ? `&shiftId=${encodeURIComponent(activeShiftId)}` : ""}`,
          ).catch(() => null)
        : Promise.resolve(null),
      activeBranch
        ? apiRequest<{ data: PrinterDevice[] }>(
            `/api/v1/printing/devices?branchId=${encodeURIComponent(activeBranch)}`,
          ).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]);
    const eventRows = (
      await Promise.all(
        occurrenceResult.data.map((item) =>
          apiRequest<{ data: OccurrenceEvent[] }>(
            `/api/v1/staff-finance/occurrences/${item.id}/events`,
          )
            .then((result) => result.data)
            .catch(() => []),
        ),
      )
    ).flat();
    setSettlements(settlementResult.data);
    setManagerial(settlementResult.managerial);
    setOccurrences(occurrenceResult.data);
    setEvents(eventRows);
    setOrders(orderResult.data);
    setPolicies(policyResult.data);
    setAccruals(accrualResult.data);
    setPayments(paymentResult.data);
    setUsers(userResult);
    setServicePolicy(servicePolicyResult);
    setReport(reportResult);
    setPrinters(printerResult.data.filter((printer) => printer.isActive));
    setStatus(
      current.shift ? "Turno carregado." : "Abra um turno para calcular o fechamento da equipe.",
    );
  }, []);

  useEffect(() => {
    void refresh().catch(() => setStatus("Não foi possível carregar os dados agora."));
  }, [refresh]);
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action()
      .then(refresh)
      .then(() => setStatus("Atualizado com auditoria."))
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Não foi possível concluir agora."),
      )
      .finally(() => setBusy(false));
  };
  const post = (path: string, body: Record<string, unknown> = {}) =>
    apiRequest(path, { method: "POST", body });
  const transition = (item: Settlement, action: "check" | "close" | "reopen") => {
    const reason = action === "reopen" ? window.prompt("Motivo da reabertura:")?.trim() : undefined;
    if (action === "reopen" && !reason) return;
    run(() =>
      post(`/api/v1/staff-finance/settlements/${item.id}/${action}`, {
        expectedVersion: item.version,
        idempotencyKey: key(),
        ...(reason ? { reason } : {}),
      }),
    );
  };
  const managerialTransition = (action: "close" | "reopen") => {
    if (!managerial) return;
    const reason = action === "reopen" ? window.prompt("Motivo da reabertura:")?.trim() : undefined;
    if (action === "reopen" && !reason) return;
    run(() =>
      post(`/api/v1/staff-finance/managerial-settlements/${managerial.id}/${action}`, {
        expectedVersion: managerial.version,
        idempotencyKey: key(),
        ...(reason ? { reason } : {}),
      }),
    );
  };
  const decide = (item: Occurrence, decision: "approved" | "dismissed" | "house_loss") =>
    run(() =>
      post(`/api/v1/staff-finance/occurrences/${item.id}/transition`, {
        expectedVersion: item.version,
        decision,
        idempotencyKey: key(),
      }),
    );
  const recover = (item: Occurrence) => {
    const value = window.prompt("Valor recuperado (R$):")?.trim();
    if (!value) return;
    run(() =>
      post(`/api/v1/staff-finance/occurrences/${item.id}/recover`, {
        amountCents: cents(value),
        method: "informado",
        idempotencyKey: key(),
      }),
    );
  };
  const reverseRecovery = (event: OccurrenceEvent) => {
    const note = window.prompt("Motivo do estorno:")?.trim();
    if (!note) return;
    run(() =>
      post(`/api/v1/staff-finance/occurrence-events/${event.id}/reverse`, {
        note,
        idempotencyKey: key(),
      }),
    );
  };
  const updateServiceCharge = (order: OpenOrder, action: "accept" | "remove" | "manual") => {
    const manualValue =
      action === "manual" ? window.prompt("Valor da taxa de serviço (R$):")?.trim() : undefined;
    if (action === "manual" && !manualValue) return;
    const reason =
      action === "manual" ? window.prompt("Motivo do ajuste manual:")?.trim() : undefined;
    if (action === "manual" && !reason) return;
    run(() =>
      apiRequest(`/api/v1/staff-finance/orders/${order.id}/service-charge`, {
        method: "PATCH",
        body: {
          action,
          expectedVersion: order.version,
          ...(manualValue ? { manualCents: cents(manualValue) } : {}),
          ...(reason ? { reason } : {}),
        },
      }),
    );
  };
  const showSettlementDetail = (item: Settlement) => {
    run(async () => {
      const result = await apiRequest<Settlement>(`/api/v1/staff-finance/settlements/${item.id}`);
      setDetail(result);
      return result;
    });
  };
  const queueThermalReport = () => {
    const printer = printers[0];
    if (!printer) return;
    run(() =>
      post("/api/v1/staff-finance/reports/financial/queue", {
        branchId,
        shiftId: shiftId || undefined,
        printerDeviceId: printer.id,
        copies: 1,
        idempotencyKey: key(),
      }),
    );
  };
  const openReport = (format: "csv" | "print" | "thermal") =>
    window.open(
      `/api/v1/staff-finance/reports/financial${format === "csv" ? ".csv" : `/${format}`}?branchId=${encodeURIComponent(branchId)}${shiftId ? `&shiftId=${encodeURIComponent(shiftId)}` : ""}`,
      "_blank",
      "noopener,noreferrer",
    );

  return (
    <main className="team-page staff-finance-page">
      <header className="team-page-header">
        <a className="button ghost compact" href="/app/team">
          <ArrowLeft size={16} /> Equipe
        </a>
        <div>
          <span className="section-kicker">Gestão da equipe</span>
          <h1>Fechamento da equipe</h1>
          <p role="status">{status}</p>
        </div>
        <button
          className="button secondary compact"
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>
      <aside className="staff-finance-notice">
        <AlertTriangle size={18} />
        <p>{legalNotice}</p>
      </aside>
      <nav className="staff-finance-tabs" aria-label="Fechamento da equipe">
        {(
          [
            ["shift", ClipboardList, "Turno"],
            ["occurrences", AlertTriangle, "Ocorrências"],
            ["partnerships", HandCoins, "Parcerias"],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            className={tab === value ? "selected" : ""}
            onClick={() => setTab(value)}
            type="button"
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      {tab === "shift" ? (
        <section className="staff-finance-grid">
          <article className="panel">
            <span className="section-kicker">Resumo do turno</span>
            <h2>{shiftId ? "Conferência por pessoa" : "Nenhum turno aberto"}</h2>
            <div className="staff-finance-metrics">
              <Metric label="Pessoas" value={String(settlements.length)} />
              <Metric
                label="Taxa recebida"
                value={money(
                  settlements.reduce(
                    (sum, item) => sum + item.serviceReceivedCents,
                    managerial?.serviceReceivedCents ?? 0,
                  ),
                )}
              />
              <Metric
                label="Dinheiro a entregar"
                value={money(
                  settlements.reduce(
                    (sum, item) => sum + item.pendingCashCents,
                    managerial?.pendingCashCents ?? 0,
                  ),
                )}
              />
              <Metric label="Não atribuído" value={money(managerial?.netConsumptionCents ?? 0)} />
            </div>
            <div className="staff-finance-row-actions">
              <button
                className="button primary"
                type="button"
                onClick={() =>
                  run(() =>
                    post(`/api/v1/staff-finance/shifts/${shiftId}/calculate`, {
                      idempotencyKey: key(),
                    }),
                  )
                }
                disabled={busy || !shiftId}
              >
                <UsersRound size={16} /> Calcular fechamento
              </button>
              <button
                className="button ghost compact"
                type="button"
                onClick={() => openReport("csv")}
                disabled={!branchId}
              >
                <Download size={16} /> CSV
              </button>
              <button
                className="button ghost compact"
                type="button"
                onClick={() => openReport("print")}
                disabled={!branchId}
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                className="button ghost compact"
                type="button"
                onClick={() => openReport("thermal")}
                disabled={!branchId}
              >
                <Printer size={16} /> Arquivo térmico
              </button>
              <button
                className="button ghost compact"
                type="button"
                onClick={queueThermalReport}
                disabled={!branchId || printers.length === 0 || busy}
                title={
                  printers.length
                    ? `Enviar para ${printers[0]?.name}`
                    : "Cadastre uma impressora térmica na operação"
                }
              >
                <Printer size={16} /> Enviar à impressora
              </button>
            </div>
            {report ? (
              <section
                className="staff-finance-metrics"
                aria-label="Totais auditáveis do fechamento"
              >
                {(report.totalEntries ?? []).map((entry) => (
                  <Metric key={entry.key} label={entry.label} value={money(entry.valueCents)} />
                ))}
                <Metric
                  label="Identificador da projeção"
                  value={report.projectionHash.slice(0, 12)}
                />
              </section>
            ) : null}
          </article>
          <ServicePolicyCard
            branchId={branchId}
            policy={servicePolicy}
            users={users}
            busy={busy}
            run={run}
          />
          <OrderServiceCard orders={orders} busy={busy} onUpdate={updateServiceCharge} />
          <article className="panel">
            <h2>Pessoas do turno</h2>
            <div className="team-list">
              {settlements.map((item) => (
                <SettlementRow
                  key={item.id}
                  label={users.find((user) => user.id === item.waiterUserId)?.name ?? "Integrante"}
                  item={item}
                  busy={busy}
                  onAction={(action) => transition(item, action)}
                  onDetail={() => showSettlementDetail(item)}
                />
              ))}
            </div>
            {managerial ? (
              <div className="team-row">
                <div>
                  <strong>Valores sem responsável</strong>
                  <span>Bucket gerencial · {money(managerial.netConsumptionCents)}</span>
                </div>
                <div>
                  <strong>{money(managerial.pendingCashCents)}</strong>
                  <span>{settlementStatus(managerial.status)}</span>
                </div>
                <div className="staff-finance-row-actions">
                  {managerial.status === "checked" ? (
                    <button
                      type="button"
                      className="button primary compact"
                      onClick={() => managerialTransition("close")}
                      disabled={busy || managerial.pendingCashCents > 0}
                    >
                      Fechar
                    </button>
                  ) : null}
                  {managerial.status === "closed" ? (
                    <button
                      type="button"
                      className="button ghost compact"
                      onClick={() => managerialTransition("reopen")}
                      disabled={busy}
                    >
                      Reabrir
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
          {detail ? <SettlementDetail item={detail} onClose={() => setDetail(null)} /> : null}
        </section>
      ) : null}

      {tab === "occurrences" ? (
        <section className="staff-finance-grid">
          <article className="panel">
            <span className="section-kicker">Análise gerencial</span>
            <h2>Ocorrências operacionais</h2>
            <p className="muted-copy">
              Registre a comanda e analise a ocorrência. Nenhuma ação trabalhista é automática.
            </p>
            <form
              className="staff-finance-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                run(() =>
                  post("/api/v1/staff-finance/occurrences", {
                    branchId,
                    orderId: String(form.get("orderId") || "") || undefined,
                    type: String(form.get("type")),
                    report: String(form.get("report")),
                    idempotencyKey: key(),
                  }),
                );
                event.currentTarget.reset();
              }}
            >
              <label>
                Comanda
                <select name="orderId">
                  <option value="">Sem comanda</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.tableId ? "Mesa" : "Balcão"} · {money(order.totalCents)} ·{" "}
                      {readOperationalStatusLabel(order.status)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <input name="type" required maxLength={60} placeholder="Ex.: saída sem pagamento" />
              </label>
              <label>
                Relato
                <input
                  name="report"
                  required
                  minLength={5}
                  maxLength={2000}
                  placeholder="Descreva o ocorrido"
                />
              </label>
              <button
                className="button secondary compact"
                type="submit"
                disabled={busy || !branchId}
              >
                Registrar
              </button>
            </form>
            <div className="team-list">
              {occurrences.map((item) => (
                <div className="team-row" key={item.id}>
                  <div>
                    <strong>{item.type}</strong>
                    <span>
                      {new Date(item.createdAt).toLocaleString("pt-BR")} ·{" "}
                      {item.orderId ? "Comanda vinculada" : "Sem comanda"}
                    </span>
                  </div>
                  <div>
                    <strong>{money(item.unpaidBalanceCents)}</strong>
                    <span>
                      {item.decision
                        ? occurrenceDecision(item.decision)
                        : occurrenceStatus(item.status)}
                    </span>
                  </div>
                  <div className="staff-finance-row-actions">
                    {item.status === "under_review" ? (
                      <>
                        <button
                          type="button"
                          className="button ghost compact"
                          onClick={() => decide(item, "dismissed")}
                        >
                          Arquivar
                        </button>
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => decide(item, "approved")}
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => decide(item, "house_loss")}
                        >
                          Perda da casa
                        </button>
                      </>
                    ) : null}
                    {["approved", "house_loss"].includes(item.decision ?? "") ? (
                      <button
                        type="button"
                        className="button ghost compact"
                        onClick={() => recover(item)}
                      >
                        Registrar recuperação
                      </button>
                    ) : null}
                    {events
                      .filter(
                        (entry) =>
                          entry.occurrenceId === item.id &&
                          entry.eventType === "recovery" &&
                          !events.some((other) => other.reversesEventId === entry.id),
                      )
                      .map((entry) => (
                        <button
                          type="button"
                          key={entry.id}
                          className="button ghost compact"
                          onClick={() => reverseRecovery(entry)}
                        >
                          Estornar {money(entry.amountCents)}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === "partnerships" ? (
        <Partnerships
          branchId={branchId}
          users={users}
          policies={policies}
          accruals={accruals}
          payments={payments}
          busy={busy}
          run={run}
        />
      ) : null}
    </main>
  );
}

function ServicePolicyCard({
  branchId,
  policy,
  users,
  busy,
  run,
}: {
  branchId: string;
  policy: ServicePolicy | null;
  users: User[];
  busy: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  return (
    <article className="panel">
      <span className="section-kicker">Regra da filial</span>
      <h2>Como dividir vendas e serviço</h2>
      <p className="muted-copy">
        Escolha uma regra simples. O detalhamento fica registrado em cada fechamento e pode ser
        conferido antes de encerrar o turno.
      </p>
      <form
        className="staff-finance-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const attributionMode = String(form.get("attributionMode"));
          const selected = form.getAll("poolMember").map(String);
          run(() =>
            apiRequest("/api/v1/staff-finance/service-policy", {
              method: "PUT",
              body: {
                branchId,
                attributionMode,
                serviceRateBps: Math.round(Number(form.get("serviceRate")) * 100),
                serviceBase: String(form.get("serviceBase")),
                requireWaiterConfirmation: form.get("requireWaiterConfirmation") === "on",
                poolRules:
                  attributionMode === "shift_pool"
                    ? {
                        weights: selected.map((userId) => ({
                          userId,
                          weight: Math.max(1, Number(form.get(`weight-${userId}`) ?? 1)),
                        })),
                      }
                    : {},
                confirmedLegalReview: true,
                expectedVersion: policy?.version ?? 0,
                idempotencyKey: key(),
              },
            }),
          );
        }}
      >
        <label>
          Responsável pela venda
          <select
            name="attributionMode"
            defaultValue={policy?.attributionMode ?? "table_responsible"}
          >
            <option value="table_responsible">Garçom responsável pela mesa</option>
            <option value="item_author">Pessoa que lançou cada item</option>
            <option value="shift_pool">Divisão entre a equipe do turno</option>
          </select>
          <small>Define onde cada centavo aparece no fechamento.</small>
        </label>
        <label>
          Taxa sugerida (%)
          <input
            name="serviceRate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={(policy?.serviceRateBps ?? 1_000) / 100}
            required
          />
        </label>
        <label>
          Base da taxa
          <select name="serviceBase" defaultValue={policy?.serviceBase ?? "net_consumption"}>
            <option value="net_consumption">Consumo após descontos</option>
            <option value="gross_consumption">Consumo antes dos descontos</option>
            <option value="manual">Informado na comanda</option>
          </select>
        </label>
        <label className="staff-finance-checkbox">
          <input
            name="requireWaiterConfirmation"
            type="checkbox"
            defaultChecked={policy?.requireWaiterConfirmation ?? true}
          />
          Garçom confirma o próprio fechamento antes da gerência
        </label>
        <fieldset>
          <legend>Pesos da divisão do turno</legend>
          <p className="muted-copy">
            Usado somente quando a opção de divisão da equipe estiver ativa.
          </p>
          {users.map((user) => (
            <label className="staff-finance-pool-member" key={user.id}>
              <input name="poolMember" type="checkbox" value={user.id} />
              <span>{user.name}</span>
              <input
                aria-label={`Peso de ${user.name}`}
                name={`weight-${user.id}`}
                type="number"
                min="1"
                max="100"
                defaultValue="1"
              />
            </label>
          ))}
        </fieldset>
        <button className="button secondary compact" type="submit" disabled={busy || !branchId}>
          Salvar regra
        </button>
      </form>
    </article>
  );
}

function OrderServiceCard({
  orders,
  busy,
  onUpdate,
}: {
  orders: OpenOrder[];
  busy: boolean;
  onUpdate: (order: OpenOrder, action: "accept" | "remove" | "manual") => void;
}) {
  return (
    <article className="panel">
      <span className="section-kicker">Comandas abertas</span>
      <h2>Taxa de serviço por comanda</h2>
      <p className="muted-copy">
        Aceite a sugestão, retire a taxa ou informe outro valor antes do primeiro pagamento.
      </p>
      <div className="team-list">
        {orders.map((order) => (
          <div className="team-row" key={order.id}>
            <div>
              <strong>{order.tableId ? "Mesa" : "Balcão"}</strong>
              <span>
                Consumo {money(order.subtotalCents - order.discountCents)} · Sugestão{" "}
                {money(order.serviceChargeSuggestedCents)}
              </span>
            </div>
            <div>
              <strong>{money(order.serviceChargeCents)}</strong>
              <span>{serviceChargeStatus(order.serviceChargeStatus)}</span>
            </div>
            <div className="staff-finance-row-actions">
              <button
                type="button"
                className="button primary compact"
                disabled={busy}
                onClick={() => onUpdate(order, "accept")}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="button ghost compact"
                disabled={busy}
                onClick={() => onUpdate(order, "remove")}
              >
                Retirar
              </button>
              <button
                type="button"
                className="button ghost compact"
                disabled={busy}
                onClick={() => onUpdate(order, "manual")}
              >
                Outro valor
              </button>
            </div>
          </div>
        ))}
        {orders.length === 0 ? <p className="muted-copy">Nenhuma comanda aberta.</p> : null}
      </div>
    </article>
  );
}

function SettlementDetail({ item, onClose }: { item: Settlement; onClose: () => void }) {
  const rawOrders = Array.isArray(item.breakdown?.orders)
    ? (item.breakdown.orders as Array<Record<string, unknown>>)
    : [];
  const orders: Array<{
    orderId: unknown;
    netPaidCents: number;
    serviceReceivedCents: number;
    discountCents: number;
  }> = rawOrders.flatMap((order) => {
    const recipients = Array.isArray(order.recipients)
      ? (order.recipients as Array<Record<string, unknown>>)
      : [];
    const recipient = recipients.find((entry) => entry.recipientId === item.waiterUserId);
    return recipient
      ? [
          {
            orderId: order.orderId,
            netPaidCents: Number(recipient.netPaidCents ?? 0),
            serviceReceivedCents: Number(recipient.serviceReceivedCents ?? 0),
            discountCents: Number(recipient.discountCents ?? 0),
          },
        ]
      : [];
  });
  return (
    <article className="panel staff-finance-detail" aria-label="Detalhamento do fechamento">
      <div className="staff-finance-detail-heading">
        <div>
          <span className="section-kicker">Conferência centavo a centavo</span>
          <h2>Detalhamento do fechamento</h2>
        </div>
        <button className="button ghost compact" type="button" onClick={onClose}>
          Fechar detalhe
        </button>
      </div>
      <p className="muted-copy">
        Calculado em {item.calculatedAt ? new Date(item.calculatedAt).toLocaleString("pt-BR") : "-"}
        {item.ledgerHash ? ` · Hash ${item.ledgerHash.slice(0, 12)}` : ""}
      </p>
      <div className="team-list">
        {orders.map((order, index) => (
          <div className="team-row" key={String(order.orderId ?? index)}>
            <div>
              <strong>Comanda {String(order.orderId ?? "-").slice(0, 8)}</strong>
              <span>Somente a parcela atribuída a este integrante</span>
            </div>
            <div>
              <strong>{money(Number(order.netPaidCents ?? 0))}</strong>
              <span>
                Serviço {money(Number(order.serviceReceivedCents ?? 0))} · Desconto{" "}
                {money(Number(order.discountCents ?? 0))}
              </span>
            </div>
          </div>
        ))}
        {orders.length === 0 ? <p className="muted-copy">Sem comandas atribuídas.</p> : null}
      </div>
    </article>
  );
}

function Partnerships({
  branchId,
  users,
  policies,
  accruals,
  payments,
  busy,
  run,
}: {
  branchId: string;
  users: User[];
  policies: Policy[];
  accruals: Accrual[];
  payments: Payment[];
  busy: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  const post = (path: string, body: Record<string, unknown> = {}) =>
    apiRequest(path, { method: "POST", body });
  return (
    <section className="staff-finance-grid">
      <article className="panel">
        <span className="section-kicker">Regra configurável</span>
        <h2>Políticas de parceria</h2>
        <p className="muted-copy">
          Use linguagem simples com regras validadas pelo estabelecimento.
        </p>
        <form
          className="staff-finance-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(() =>
              post("/api/v1/staff-finance/commission-policies", {
                branchId,
                name: String(form.get("name")),
                model: "fixed_rate",
                period: String(form.get("period")),
                base: String(form.get("base")),
                attributionMode: String(form.get("attributionMode")),
                rules: { rateBps: Math.round(Number(form.get("rate")) * 100) },
                memberIds: form.getAll("memberIds"),
                confirmedLegalReview: true,
                idempotencyKey: key(),
              }),
            );
          }}
        >
          <label>
            Nome
            <input name="name" required placeholder="Ex.: Parceria mensal" />
          </label>
          <label>
            Período
            <select name="period">
              <option value="shift">Turno</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
          </label>
          <label>
            Base
            <select name="base">
              <option value="net_confirmed_sales">Vendas confirmadas</option>
              <option value="net_paid_sales">Vendas recebidas</option>
              <option value="service_received">Serviço recebido</option>
            </select>
          </label>
          <label>
            Atribuição
            <select name="attributionMode">
              <option value="table_responsible">Responsável pela mesa</option>
              <option value="item_author">Quem lançou o item</option>
              <option value="shift_pool">Divisão do turno</option>
            </select>
          </label>
          <label>
            Percentual
            <input name="rate" type="number" min="0" max="100" step="0.01" required />
          </label>
          <label>
            Participantes
            <select name="memberIds" multiple required>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button secondary compact" disabled={busy || !branchId}>
            Criar política
          </button>
        </form>
        <div className="team-list">
          {policies.map((policy) => (
            <div className="team-row" key={policy.id}>
              <div>
                <strong>{policy.name}</strong>
                <span>{policyStatus(policy.status)}</span>
              </div>
              {policy.status !== "active" ? (
                <button
                  type="button"
                  className="button primary compact"
                  onClick={() =>
                    run(() =>
                      post(`/api/v1/staff-finance/commission-policies/${policy.id}/activate`, {
                        expectedVersion: policy.version,
                        idempotencyKey: key(),
                      }),
                    )
                  }
                >
                  Ativar
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </article>
      <article className="panel">
        <h2>Apurações</h2>
        <form
          className="staff-finance-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(() =>
              post("/api/v1/staff-finance/commission-accruals/calculate", {
                policyId: String(form.get("policyId")),
                userId: String(form.get("userId")),
                periodStart: String(form.get("periodStart")),
                periodEnd: String(form.get("periodEnd")),
                idempotencyKey: key(),
              }),
            );
          }}
        >
          <label>
            Política
            <select name="policyId" required>
              {policies
                .filter((policy) => policy.status === "active")
                .map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Integrante
            <select name="userId" required>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input name="periodStart" type="datetime-local" required />
          </label>
          <label>
            Fim
            <input name="periodEnd" type="datetime-local" required />
          </label>
          <button type="submit" className="button secondary compact" disabled={busy}>
            Calcular
          </button>
        </form>
        <div className="team-list">
          {accruals.map((item) => (
            <div className="team-row" key={item.id}>
              <div>
                <strong>
                  {users.find((user) => user.id === item.userId)?.name ?? "Integrante"}
                </strong>
                <span>{accrualStatus(item.status)}</span>
              </div>
              <div>
                <strong>{money(item.calculatedCents)}</strong>
                <span>Pago informado: {money(item.paidCents)}</span>
              </div>
              <div className="staff-finance-row-actions">
                {item.status === "calculated" ? (
                  <>
                    <button
                      type="button"
                      className="button primary compact"
                      onClick={() =>
                        run(() =>
                          post(`/api/v1/staff-finance/commission-accruals/${item.id}/approve`, {
                            expectedVersion: item.version,
                            idempotencyKey: key(),
                          }),
                        )
                      }
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="button ghost compact"
                      onClick={() => {
                        const reason = window.prompt("Motivo da rejeição:")?.trim();
                        if (reason)
                          run(() =>
                            post(`/api/v1/staff-finance/commission-accruals/${item.id}/reject`, {
                              expectedVersion: item.version,
                              reason,
                              idempotencyKey: key(),
                            }),
                          );
                      }}
                    >
                      Rejeitar
                    </button>
                  </>
                ) : null}
                {["approved", "partially_paid"].includes(item.status) ? (
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={() => {
                      const value = window.prompt("Valor pago (R$):")?.trim();
                      if (value)
                        run(() =>
                          post(`/api/v1/staff-finance/commission-accruals/${item.id}/payments`, {
                            amountCents: cents(value),
                            informedAt: new Date().toISOString(),
                            method: "informado",
                            idempotencyKey: key(),
                          }),
                        );
                    }}
                  >
                    Registrar pagamento
                  </button>
                ) : null}
                {payments
                  .filter(
                    (payment) =>
                      payment.accrualId === item.id &&
                      payment.amountCents > 0 &&
                      !payments.some((other) => other.reversesRecordId === payment.id),
                  )
                  .map((payment) => (
                    <button
                      type="button"
                      key={payment.id}
                      className="button ghost compact"
                      onClick={() => {
                        const note = window.prompt("Motivo do estorno:")?.trim();
                        if (note)
                          run(() =>
                            post(
                              `/api/v1/staff-finance/commission-payment-records/${payment.id}/reverse`,
                              { note, idempotencyKey: key() },
                            ),
                          );
                      }}
                    >
                      Estornar {money(payment.amountCents)}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function SettlementRow({
  label,
  item,
  busy,
  onAction,
  onDetail,
}: {
  label: string;
  item: Settlement;
  busy: boolean;
  onAction: (action: "check" | "close" | "reopen") => void;
  onDetail: () => void;
}) {
  const requireWaiterConfirmation = item.policySnapshot?.requireWaiterConfirmation === true;
  return (
    <div className="team-row">
      <div>
        <strong>{label}</strong>
        <span>
          Vendas {money(item.netConsumptionCents)} · Serviço {money(item.serviceReceivedCents)}
        </span>
      </div>
      <div>
        <strong>{item.pendingCashCents ? money(item.pendingCashCents) : "Conferido"}</strong>
        <span>{settlementStatus(item.status)}</span>
      </div>
      <div className="staff-finance-row-actions">
        <button type="button" className="button ghost compact" onClick={onDetail} disabled={busy}>
          <Eye size={15} /> Detalhar
        </button>
        {item.status === "awaiting_confirmation" && !requireWaiterConfirmation ? (
          <button
            type="button"
            className="button ghost compact"
            onClick={() => onAction("check")}
            disabled={busy}
          >
            Conferir
          </button>
        ) : null}
        {item.status === "awaiting_confirmation" && requireWaiterConfirmation ? (
          <span className="muted-copy">Aguardando confirmação do garçom</span>
        ) : null}
        {item.status === "checked" ? (
          <button
            type="button"
            className="button primary compact"
            onClick={() => onAction("close")}
            disabled={busy || item.pendingCashCents > 0}
          >
            Fechar
          </button>
        ) : null}
        {item.status === "closed" ? (
          <button
            type="button"
            className="button ghost compact"
            onClick={() => onAction("reopen")}
            disabled={busy}
          >
            Reabrir
          </button>
        ) : null}
      </div>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
const translate = (status: string, values: Record<string, string>) => values[status] ?? status;
const settlementStatus = (value: string) =>
  translate(value, {
    calculating: "Em cálculo",
    awaiting_confirmation: "Aguardando confirmação",
    checked: "Conferido",
    closed: "Fechado",
    reopened: "Reaberto",
  });
const serviceChargeStatus = (value: string) =>
  translate(value, {
    not_configured: "Aguardando decisão",
    suggested: "Sugerida",
    accepted: "Aceita",
    removed: "Retirada",
    manual: "Ajustada manualmente",
  });
const occurrenceStatus = (value: string) =>
  translate(value, { under_review: "Em análise", approved: "Aprovada", closed: "Encerrada" });
const occurrenceDecision = (value: string) =>
  translate(value, { approved: "Aprovada", dismissed: "Arquivada", house_loss: "Perda da casa" });
const policyStatus = (value: string) =>
  translate(value, {
    draft: "Rascunho",
    active: "Ativa",
    superseded: "Substituída",
    archived: "Arquivada",
  });
const accrualStatus = (value: string) =>
  translate(value, {
    calculated: "Calculada",
    approved: "Aprovada",
    rejected: "Rejeitada",
    partially_paid: "Pagamento parcial",
    paid: "Paga",
    reversed: "Pagamento estornado",
  });
