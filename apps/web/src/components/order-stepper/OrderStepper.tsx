"use client";

import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  CupSoda,
  LogIn,
  Plus,
  QrCode,
  Search,
  Send,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addOrderItem,
  claimWaiterTable,
  closeOrder,
  type DiningTable,
  formatMoney,
  getActiveOrder,
  getCurrentOperationalDevice,
  getSession,
  getTenantBranding,
  listOrderPayments,
  listProducts,
  listTables,
  listWaiterAssignments,
  type OpenOrderResponse,
  type OperationalDeviceProfile,
  type OrderItemResponse,
  type OrderPayment,
  openOrder,
  type Product,
  registerManualPayment,
  replayOperationalMutation,
  requestWaiterHelp,
  sendOrderToKitchen,
  type TenantBranding,
  type TenantSession,
  type WaiterAssignmentList,
} from "../../lib/giromesa-api";
import {
  createOperationalOutbox,
  createOperationIdempotencyKey,
  executeOperationalCommand,
  reconcileOperationalOutbox,
} from "../../lib/operational-outbox";
import { OperationalAttentionPanel } from "../operational-attention/OperationalAttentionPanel";

const demoTables: DiningTable[] = [
  { id: "demo-m03", branchId: "demo", code: "M03", name: "Mesa 03", seats: 4, status: "free" },
  {
    id: "demo-m07",
    branchId: "demo",
    code: "M07",
    name: "Mesa 07",
    seats: 2,
    status: "occupied",
  },
  {
    id: "demo-b01",
    branchId: "demo",
    code: "B01",
    name: "Balcão 01",
    seats: 1,
    status: "waiting_payment",
  },
];

const demoProducts: Product[] = [
  {
    id: "demo-burger",
    name: "Burger Aurora",
    description: "Pão brioche, blend da casa e queijo.",
    categoryId: null,
    priceCents: 4290,
    costCents: 1800,
    isAvailable: true,
    isAlcoholic: false,
    channels: ["pos"],
  },
  {
    id: "demo-chopp",
    name: "Chopp Pilsen 500ml",
    description: "Tiragem rápida para salão.",
    categoryId: null,
    priceCents: 1690,
    costCents: 720,
    isAvailable: true,
    isAlcoholic: true,
    channels: ["pos"],
  },
  {
    id: "demo-dessert",
    name: "Brownie com sorvete",
    description: "Sobremesa com preparo na cozinha.",
    categoryId: null,
    priceCents: 2490,
    costCents: 980,
    isAvailable: true,
    isAlcoholic: false,
    channels: ["pos"],
  },
];

const fallbackBranding: TenantBranding = {
  displayName: "GiroMesa",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};

type Status = "loading" | "ready" | "demo" | "error";
type Step = 1 | 2 | 3;
type TableFilter = "all" | "free" | "occupied" | "waiting_payment";
type ProductFilter = "all" | "kitchen" | "drinks" | "dessert" | "favorites" | "recent";
type ServiceMode = "table" | "counter";
type PaymentMethod = "pix" | "credit_card" | "debit_card" | "cash";
type PendingWaiterItem = {
  localKey: string;
  orderId: string;
  tableId: string | null;
  productId: string;
  productName: string;
  quantity: number;
  notes: string;
};

const notePresets = [
  "Cliente com pressa",
  "Aniversariante",
  "Sem gelo",
  "Alergia alimentar",
  "Priorizar bebidas",
] as const;

const tableStatusLabels: Record<string, string> = {
  free: "Livre",
  occupied: "Em atendimento",
  waiting_payment: "Aguardando pagamento",
  waiting_order: "Aguardando pedido",
  order_sent: "Pedido enviado",
  preparing: "Em preparo",
  reserved: "Reservada",
  blocked: "Bloqueada",
};

const paymentMethods: { id: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { id: "pix", label: "PIX", icon: QrCode },
  { id: "credit_card", label: "Cartão crédito", icon: CreditCard },
  { id: "debit_card", label: "Cartão débito", icon: CreditCard },
  { id: "cash", label: "Dinheiro", icon: Banknote },
];

function tableStatusLabel(status: string) {
  return tableStatusLabels[status] ?? status.replaceAll("_", " ");
}

function productKind(product: Product): ProductFilter {
  const haystack = `${product.name} ${product.description ?? ""}`.toLowerCase();
  if (haystack.includes("chopp") || haystack.includes("drink") || haystack.includes("pilsen")) {
    return "drinks";
  }
  if (haystack.includes("brownie") || haystack.includes("sobremesa")) {
    return "dessert";
  }
  return "kitchen";
}

export default function OrderStepper() {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<TenantSession | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branding, setBranding] = useState<TenantBranding>(fallbackBranding);
  const [step, setStep] = useState<Step>(1);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("table");
  const [selectedTableId, setSelectedTableId] = useState(demoTables[0]?.id ?? "");
  const [tableFilter, setTableFilter] = useState<TableFilter>("all");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [productQuery, setProductQuery] = useState("");
  const [peopleCount, setPeopleCount] = useState(2);
  const [serviceNote, setServiceNote] = useState("");
  const [order, setOrder] = useState<OpenOrderResponse | null>(null);
  const [items, setItems] = useState<OrderItemResponse[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [message, setMessage] = useState("Monte o pedido em 3 passos rápidos.");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentProductIds, setRecentProductIds] = useState<string[]>([]);
  const [operationalDevice, setOperationalDevice] = useState<OperationalDeviceProfile | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingWaiterItem[]>([]);
  const [assignmentState, setAssignmentState] = useState<WaiterAssignmentList>({
    shift: null,
    assignments: [],
  });

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? tables[0];
  const itemsTotalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.totalCents, 0),
    [items],
  );
  const totalCents = itemsTotalCents > 0 ? itemsTotalCents : (order?.totalCents ?? 0);
  const paidCents = payments
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const unsentCount = items.filter(
    (item) => !["sent", "preparing", "ready", "served"].includes(item.status ?? "pending"),
  ).length;
  const branchId = session?.branchId;
  const brandInitial = branding.displayName.slice(0, 1).toUpperCase() || "G";

  const filteredTables = useMemo(
    () =>
      tables.filter((table) => {
        if (tableFilter === "all") return true;
        if (tableFilter === "occupied")
          return table.status !== "free" && table.status !== "waiting_payment";
        return table.status === tableFilter;
      }),
    [tableFilter, tables],
  );

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        q.length === 0 || `${product.name} ${product.description ?? ""}`.toLowerCase().includes(q);
      const matchesFilter =
        productFilter === "all"
          ? true
          : productFilter === "favorites"
            ? favorites.includes(product.id)
            : productFilter === "recent"
              ? recentProductIds.includes(product.id)
              : productKind(product) === productFilter;
      return matchesQuery && matchesFilter;
    });
  }, [favorites, productFilter, productQuery, products, recentProductIds]);

  const load = useCallback(async () => {
    try {
      setStatus("loading");
      const activeSession = await getSession();
      setSession(activeSession);
      if (!activeSession.branchId) {
        if (activeSession.isDemo) {
          setTables(demoTables);
          setProducts(demoProducts);
          setSelectedTableId(demoTables[0]?.id ?? "");
          setStatus("demo");
          setMessage("Prévia demonstrativa: entre no painel para operar uma filial real.");
        } else {
          setStatus("error");
          setMessage("Sua sessão não possui uma filial operacional ativa.");
        }
        return;
      }
      const [tableList, productList, tenantBranding, device, assignments] = await Promise.all([
        listTables(activeSession.branchId),
        listProducts(),
        getTenantBranding(),
        getCurrentOperationalDevice().catch(() => null),
        listWaiterAssignments(activeSession.branchId).catch(() => ({
          shift: null,
          assignments: [],
        })),
      ]);
      const nextTables = tableList.length > 0 ? tableList : activeSession.isDemo ? demoTables : [];
      const nextProducts = productList.filter((p) => p.isAvailable);
      setTables(nextTables);
      setProducts(
        nextProducts.length > 0 ? nextProducts : activeSession.isDemo ? demoProducts : [],
      );
      setBranding(tenantBranding);
      setOperationalDevice(device);
      setAssignmentState(assignments);
      if (device) {
        setServiceMode(device.initialMode === "table" ? "table" : "counter");
      }
      setSelectedTableId(nextTables[0]?.id ?? "");
      setStatus("ready");
      setMessage(`Modo garçom conectado ao ${tenantBranding.displayName}.`);
    } catch {
      setStatus("error");
      setMessage("Não foi possível carregar a operação. Atualize e tente novamente.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const draft = window.localStorage.getItem("gm_waiter_draft");
    const storedFavorites = window.localStorage.getItem("gm_waiter_favorites");
    const storedRecent = window.localStorage.getItem("gm_waiter_recent");
    try {
      const parsed = draft
        ? (JSON.parse(draft) as Partial<{
            serviceMode: ServiceMode;
            selectedTableId: string;
            peopleCount: number;
            serviceNote: string;
            pendingItems: PendingWaiterItem[];
          }>)
        : null;
      if (parsed?.serviceMode) setServiceMode(parsed.serviceMode);
      if (parsed?.selectedTableId) setSelectedTableId(parsed.selectedTableId);
      if (parsed?.peopleCount) setPeopleCount(parsed.peopleCount);
      if (parsed?.serviceNote) setServiceNote(parsed.serviceNote);
      if (Array.isArray(parsed?.pendingItems)) setPendingItems(parsed.pendingItems);
      if (storedFavorites) setFavorites(JSON.parse(storedFavorites) as string[]);
      if (storedRecent) setRecentProductIds(JSON.parse(storedRecent) as string[]);
    } catch {
      window.localStorage.removeItem("gm_waiter_draft");
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    window.localStorage.setItem(
      "gm_waiter_draft",
      JSON.stringify({ serviceMode, selectedTableId, peopleCount, serviceNote, pendingItems }),
    );
  }, [pendingItems, peopleCount, selectedTableId, serviceMode, serviceNote, status]);

  useEffect(() => {
    if (!session?.branchId || !window.navigator.onLine) return;
    const outbox = createOperationalOutbox({
      tenantId: session.tenantId,
      branchId: session.branchId,
    });
    void reconcileOperationalOutbox(outbox, replayOperationalMutation).then((summary) => {
      if (summary.confirmed > 0) {
        setMessage(`${summary.confirmed} operação(ões) do garçom reconciliada(s).`);
        void load();
      }
    });
  }, [load, session?.branchId, session?.tenantId]);

  async function runOperationalCommand<T extends Record<string, unknown>>(
    input: Parameters<ReturnType<typeof createOperationalOutbox>["enqueue"]>[0],
    send: () => Promise<T>,
  ) {
    if (!session?.branchId) throw new Error("Sessão operacional indisponível.");
    const outbox = createOperationalOutbox({
      tenantId: session.tenantId,
      branchId: session.branchId,
    });
    const execution = await executeOperationalCommand(outbox, input, () => send());
    if (!execution.result) throw new Error("Operação já confirmada. Atualize a comanda.");
    return execution.result;
  }

  async function run(label: string, action: () => Promise<void>) {
    if (!window.navigator.onLine) {
      setMessage(
        "Conexão reduzida: lançamento bloqueado. Use 4G, a contingência térmica ou registre manualmente.",
      );
      return;
    }
    try {
      setBusyLabel(label);
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusyLabel(null);
    }
  }

  function canGoNext(): boolean {
    if (step === 1) return serviceMode === "counter" || Boolean(selectedTable);
    if (step === 2) return items.length > 0;
    return false;
  }

  function handleNext() {
    if (step === 1) {
      handleOpenOrder();
    } else if (step === 2) {
      setStep(3);
    }
  }

  function handleBack() {
    if (step > 1) setStep((step - 1) as Step);
  }

  function handleOpenOrder() {
    void run("Abrindo mesa", async () => {
      if (!branchId || (serviceMode === "table" && !selectedTable)) {
        setMessage("Entre no painel para abrir uma mesa real.");
        return;
      }
      const active =
        serviceMode === "table" && selectedTable
          ? await getActiveOrder(branchId, selectedTable.id)
          : null;
      if (
        serviceMode === "table" &&
        selectedTable &&
        !assignmentState.assignments.some((row) => row.assignment.tableId === selectedTable.id)
      ) {
        const claimed = await claimWaiterTable(branchId, selectedTable.id);
        setAssignmentState((current) => ({
          ...current,
          assignments: [
            ...current.assignments,
            {
              assignment: claimed.assignment,
              tableCode: selectedTable.code,
              tableName: selectedTable.name,
              waiterName: "Você",
            },
          ],
        }));
      }
      const idempotencyKey = createOperationIdempotencyKey("open-order");
      const tableId = serviceMode === "table" ? selectedTable?.id : undefined;
      const payload = {
        branchId,
        channel: tableId ? "table" : "counter",
        ...(tableId ? { tableId } : {}),
        peopleCount,
        idempotencyKey,
      };
      const opened =
        active ??
        (await runOperationalCommand(
          {
            idempotencyKey,
            operation: "open_order",
            method: "POST",
            path: "/api/v1/pos/orders/open",
            payload,
            replayable: true,
          },
          () => openOrder(branchId, tableId, peopleCount, undefined, idempotencyKey),
        ));
      setOrder(opened);
      setItems("items" in opened && Array.isArray(opened.items) ? opened.items : []);
      setPayments("payments" in opened && Array.isArray(opened.payments) ? opened.payments : []);
      setMessage(
        serviceMode === "counter"
          ? `Balcão aberto para ${peopleCount} atendimento(s).`
          : `${selectedTable?.code ?? "Mesa"} aberta para ${peopleCount} pessoa(s).`,
      );
      setPaymentAmount("");
      setStep(2);
    });
  }

  function handleRequestHelp(tableId: string) {
    void run("Solicitando ajuda", async () => {
      if (!branchId) return;
      const payload = {
        branchId,
        tableId,
        reason: "Apoio pontual solicitado no atendimento",
      };
      const result = await runOperationalCommand(
        {
          idempotencyKey: createOperationIdempotencyKey("waiter-help"),
          operation: "request_waiter_help",
          method: "POST",
          path: "/api/v1/pos/waiter-assignments/help",
          payload,
          replayable: false,
        },
        () => requestWaiterHelp(payload),
      );
      setMessage(
        result.replayed
          ? "A solicitação de ajuda já está aguardando a gerência."
          : "Ajuda solicitada. A gerência precisa autorizar antes do lançamento.",
      );
    });
  }

  function handleAddItem(product: Product) {
    if (!order) {
      setMessage("Abra a mesa antes de lançar itens.");
      return;
    }
    const intent: PendingWaiterItem = {
      localKey: crypto.randomUUID(),
      orderId: order.id,
      tableId: serviceMode === "table" ? (selectedTable?.id ?? null) : null,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      notes: serviceNote.trim() || "Lançado pelo garçom",
    };
    if (!window.navigator.onLine) {
      setPendingItems((current) => [...current, intent]);
      setMessage(`${product.name} salvo no rascunho. Reenvie quando a conexão voltar.`);
      return;
    }
    void (async () => {
      try {
        setBusyLabel("Lançando item");
        const item = await addOrderItem(
          order.id,
          product.id,
          [],
          intent.notes,
          intent.quantity,
          intent.localKey,
        );
        setItems((current) => [...current, item]);
        setRecentProductIds((current) => {
          const next = [product.id, ...current.filter((id) => id !== product.id)].slice(0, 8);
          window.localStorage.setItem("gm_waiter_recent", JSON.stringify(next));
          return next;
        });
        setOrder((current) =>
          current
            ? { ...current, status: "opened", totalCents: current.totalCents + item.totalCents }
            : current,
        );
        setMessage(`${product.name} lançado na conta.`);
      } catch (error) {
        setPendingItems((current) => [...current, intent]);
        setMessage(
          `${product.name} ficou no rascunho: ${error instanceof Error ? error.message : "falha de conexão"}. Reenvie manualmente.`,
        );
      } finally {
        setBusyLabel(null);
      }
    })();
  }

  function retryPendingItems() {
    if (!order || !window.navigator.onLine) {
      setMessage("Abra a comanda e restabeleça a conexão antes de reenviar.");
      return;
    }
    void (async () => {
      setBusyLabel("Reenviando rascunho");
      let sent = 0;
      try {
        const eligible = pendingItems.filter(
          (intent) =>
            intent.orderId === order.id &&
            intent.tableId === (serviceMode === "table" ? (selectedTable?.id ?? null) : null),
        );
        for (const intent of eligible) {
          const item = await addOrderItem(
            intent.orderId,
            intent.productId,
            [],
            intent.notes,
            intent.quantity,
            intent.localKey,
          );
          setItems((current) =>
            current.some((existing) => existing.id === item.id) ? current : [...current, item],
          );
          setPendingItems((current) =>
            current.filter((entry) => entry.localKey !== intent.localKey),
          );
          sent += 1;
        }
        setMessage(`${sent} item(ns) do rascunho reenviado(s) sem duplicar lançamentos.`);
      } catch (error) {
        setMessage(
          `Reenvio interrompido após ${sent} item(ns): ${error instanceof Error ? error.message : "falha de conexão"}.`,
        );
      } finally {
        setBusyLabel(null);
      }
    })();
  }

  function toggleFavorite(productId: string) {
    setFavorites((current) => {
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId];
      window.localStorage.setItem("gm_waiter_favorites", JSON.stringify(next));
      return next;
    });
  }

  function handleSendToKitchen() {
    void run("Enviando para produção", async () => {
      if (!order || items.length === 0) {
        setMessage("Lance ao menos um item antes de enviar para produção.");
        return;
      }
      const idempotencyKey = createOperationIdempotencyKey("waiter-send-production");
      const sent = await runOperationalCommand(
        {
          idempotencyKey,
          operation: "send_to_production",
          method: "POST",
          path: `/api/v1/pos/orders/${order.id}/send-to-kitchen`,
          payload: {},
          replayable: true,
        },
        () => sendOrderToKitchen(order.id),
      );
      setOrder((current) => (current ? { ...current, status: "sent_to_kitchen" } : current));
      setMessage(`${String(sent.ticketsCreated.length)} lote(s) enviado(s) para produção.`);
    });
  }

  function handlePayment() {
    void run("Recebendo", async () => {
      if (!order) {
        setMessage("Abra uma conta antes de registrar recebimento.");
        return;
      }
      const requestedAmount = paymentAmount.trim()
        ? Number(paymentAmount.replace(",", "."))
        : remainingCents / 100;
      const amount = Math.round(requestedAmount * 100);
      if (amount <= 0 || amount > remainingCents) {
        throw new Error("Informe um valor dentro do saldo restante.");
      }
      const methodMap: Record<PaymentMethod, string> = {
        pix: "pix_manual",
        credit_card: "credit_card",
        debit_card: "debit_card",
        cash: "cash",
      };
      const idempotencyKey = `waiter:${order.id}:${amount}:${methodMap[paymentMethod]}`;
      const paymentInput = {
        method: methodMap[paymentMethod],
        registeredVia: "waiter",
        idempotencyKey,
      } as const;
      const payment = await runOperationalCommand(
        {
          idempotencyKey,
          operation: "register_payment",
          method: "POST",
          path: `/api/v1/pos/orders/${order.id}/payments`,
          payload: { amountCents: amount, ...paymentInput },
          replayable: true,
        },
        () => registerManualPayment(order.id, amount, paymentInput),
      );
      const nextPayments = await listOrderPayments(order.id);
      setPayments(nextPayments);
      setOrder((current) => (current ? { ...current, status: payment.orderStatus } : current));
      setPaymentAmount("");
      setMessage(
        payment.orderStatus === "paid"
          ? "Pagamento total registrado. Conta pronta para fechamento."
          : `Pagamento parcial de ${formatMoney(amount)} registrado.`,
      );
    });
  }

  function handleCloseOrder() {
    void run("Fechando conta", async () => {
      if (order?.status !== "paid") {
        setMessage("Receba o saldo restante antes de fechar a conta.");
        return;
      }
      const idempotencyKey = createOperationIdempotencyKey("waiter-close-order");
      await runOperationalCommand(
        {
          idempotencyKey,
          operation: "close_order",
          method: "POST",
          path: `/api/v1/pos/orders/${order.id}/close`,
          payload: {},
          replayable: true,
        },
        () => closeOrder(order.id),
      );
      setOrder(null);
      setItems([]);
      setPayments([]);
      setStep(1);
      window.localStorage.removeItem("gm_waiter_draft");
      setMessage("Conta fechada e mesa liberada para o próximo atendimento.");
    });
  }

  const stepLabels = ["Mesa", "Itens", "Pagamento"];

  return (
    <div className="stepper-container" data-accent={branding.accentPreset}>
      {/* Topbar */}
      <header className="stepper-topbar">
        <a className="brand" href="/app" aria-label="Voltar ao GiroMesa">
          <span
            className={branding.logoUrl ? "brand-mark brand-mark-logo" : "brand-mark"}
            style={branding.logoUrl ? { backgroundImage: `url(${branding.logoUrl})` } : undefined}
          >
            {branding.logoUrl ? "" : brandInitial}
          </span>
          <span>{branding.displayName}</span>
        </a>
        <div className="waiter-status">
          <span className={`gm-badge ${status === "ready" ? "gm-badge-good" : "gm-badge-warn"}`}>
            {status === "ready" ? "online" : status === "demo" ? "prévia" : "indisponível"}
          </span>
          {session ? (
            <span className="muted-copy">Sessão ativa</span>
          ) : (
            <a className="button secondary compact" href="/login">
              <LogIn size={16} /> Entrar
            </a>
          )}
        </div>
      </header>

      {session?.branchId ? (
        <OperationalAttentionPanel
          tenantId={session.tenantId}
          branchId={session.branchId}
          onResolved={load}
        />
      ) : null}

      {/* Step indicator */}
      <nav className="stepper-indicator" aria-label="Progresso do pedido">
        {stepLabels.map((label, index) => {
          const stepNum = (index + 1) as Step;
          const isCompleted = step > stepNum;
          const isActive = step === stepNum;
          return (
            <div key={label} style={{ display: "contents" }}>
              <div
                className={`stepper-step ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
              >
                <span className="stepper-step-circle">
                  {isCompleted ? <Check size={16} /> : stepNum}
                </span>
                <span className="stepper-step-label">{label}</span>
              </div>
              {index < stepLabels.length - 1 && (
                <span className={`stepper-line ${step > stepNum ? "completed" : ""}`} aria-hidden />
              )}
            </div>
          );
        })}
      </nav>

      {/* Content */}
      <main className="stepper-content">
        {step === 1 && (
          <StepMesa
            serviceMode={serviceMode}
            setServiceMode={setServiceMode}
            selectedTableId={selectedTableId}
            setSelectedTableId={setSelectedTableId}
            tableFilter={tableFilter}
            setTableFilter={setTableFilter}
            filteredTables={filteredTables}
            peopleCount={peopleCount}
            setPeopleCount={setPeopleCount}
            serviceNote={serviceNote}
            setServiceNote={setServiceNote}
            busyLabel={busyLabel}
            allowModeSwitch={operationalDevice?.allowModeSwitch !== false}
            assignments={assignmentState}
            currentUserId={session?.userId ?? ""}
            onRequestHelp={handleRequestHelp}
          />
        )}

        {step === 2 && (
          <StepItens
            productFilter={productFilter}
            setProductFilter={setProductFilter}
            productQuery={productQuery}
            setProductQuery={setProductQuery}
            filteredProducts={filteredProducts}
            order={order}
            items={items}
            totalCents={totalCents}
            unsentCount={unsentCount}
            busyLabel={busyLabel}
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            peopleCount={peopleCount}
            serviceNote={serviceNote}
            onAddItem={handleAddItem}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
            onRepeatItem={(productId) => {
              const product = products.find((entry) => entry.id === productId);
              if (product) handleAddItem(product);
            }}
            onSendToKitchen={handleSendToKitchen}
            pendingItems={pendingItems.filter((intent) => intent.orderId === order?.id)}
            onRetryPending={retryPendingItems}
          />
        )}

        {step === 3 && order && (
          <StepPagamento
            order={order}
            items={items}
            totalCents={totalCents}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            peopleCount={peopleCount}
            serviceNote={serviceNote}
            busyLabel={busyLabel}
            paymentAmount={paymentAmount}
            setPaymentAmount={setPaymentAmount}
            paidCents={paidCents}
            remainingCents={remainingCents}
            onPay={handlePayment}
            onClose={handleCloseOrder}
          />
        )}

        {step === 3 && order?.status === "paid" && (
          <div className="stepper-success">
            <span className="stepper-success-icon">
              <Check size={36} />
            </span>
            <h2>Pagamento confirmado</h2>
            <p>
              Conta de {formatMoney(totalCents)} registrada. Libere a mesa ou parta para a próxima
              rodada.
            </p>
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setOrder(null);
                setItems([]);
                setStep(1);
                setMessage("Pronto para novo pedido.");
              }}
            >
              <Plus size={18} /> Novo pedido
            </button>
          </div>
        )}
      </main>

      {/* Navigation footer */}
      {!(step === 3 && order?.status === "paid") && (
        <footer className="stepper-nav">
          <button
            className="button secondary"
            type="button"
            onClick={handleBack}
            disabled={step === 1}
          >
            <ChevronLeft size={18} /> Voltar
          </button>
          <div className="stepper-nav-info">
            <strong>{step === 3 ? formatMoney(totalCents) : `Passo ${step} de 3`}</strong>
            <span>{message}</span>
          </div>
          {step < 3 ? (
            <button
              className="button primary"
              type="button"
              onClick={handleNext}
              disabled={Boolean(busyLabel) || (step === 1 ? false : !canGoNext())}
            >
              {busyLabel === "Abrindo mesa" ? (
                "Abrindo..."
              ) : (
                <>
                  Próximo <ChevronRight size={18} />
                </>
              )}
            </button>
          ) : (
            <button
              className="button primary"
              type="button"
              onClick={handlePayment}
              disabled={Boolean(busyLabel) || order?.status === "paid"}
            >
              {busyLabel === "Recebendo" ? "Recebendo..." : "Finalizar"}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

/* ─── Step 1: Mesa ─── */

function StepMesa(props: {
  serviceMode: ServiceMode;
  setServiceMode: (mode: ServiceMode) => void;
  selectedTableId: string;
  setSelectedTableId: (id: string) => void;
  tableFilter: TableFilter;
  setTableFilter: (f: TableFilter) => void;
  filteredTables: DiningTable[];
  peopleCount: number;
  setPeopleCount: (n: number) => void;
  serviceNote: string;
  setServiceNote: (n: string) => void;
  busyLabel: string | null;
  allowModeSwitch: boolean;
  assignments: WaiterAssignmentList;
  currentUserId: string;
  onRequestHelp: (tableId: string) => void;
}) {
  const {
    serviceMode,
    setServiceMode,
    selectedTableId,
    setSelectedTableId,
    tableFilter,
    setTableFilter,
    filteredTables,
    peopleCount,
    setPeopleCount,
    serviceNote,
    setServiceNote,
    busyLabel,
    allowModeSwitch,
    assignments,
    currentUserId,
    onRequestHelp,
  } = props;

  const assignmentByTable = new Map(
    assignments.assignments.map((row) => [row.assignment.tableId, row]),
  );
  const selectedAssignment = assignmentByTable.get(selectedTableId);
  const groups = [
    {
      label: "Minhas mesas",
      tables: filteredTables.filter(
        (table) => assignmentByTable.get(table.id)?.assignment.waiterUserId === currentUserId,
      ),
    },
    {
      label: "Livres",
      tables: filteredTables.filter((table) => !assignmentByTable.has(table.id)),
    },
    {
      label: "Outras mesas",
      tables: filteredTables.filter((table) => {
        const assignment = assignmentByTable.get(table.id);
        return assignment && assignment.assignment.waiterUserId !== currentUserId;
      }),
    },
  ].filter((group) => group.tables.length > 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h2 className="stepper-step-title">Mesa</h2>
        <p className="stepper-step-subtitle">Selecione a mesa ou abra um atendimento de balcão.</p>
      </div>

      {allowModeSwitch ? (
        <div className="stepper-mode-switch" role="tablist" aria-label="Modo de atendimento">
          <button
            className={`button ${serviceMode === "table" ? "primary" : "ghost"} compact`}
            type="button"
            onClick={() => setServiceMode("table")}
          >
            <UtensilsCrossed size={16} /> Mesa
          </button>
          <button
            className={`button ${serviceMode === "counter" ? "primary" : "ghost"} compact`}
            type="button"
            onClick={() => setServiceMode("counter")}
          >
            <CupSoda size={16} /> Balcão
          </button>
        </div>
      ) : null}

      {serviceMode === "table" && (
        <>
          <div className="platform-toolbar">
            <label className="platform-search">
              Filtro
              <select
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value as TableFilter)}
              >
                <option value="all">Todas</option>
                <option value="free">Livres</option>
                <option value="occupied">Em atendimento</option>
                <option value="waiting_payment">Pagamento</option>
              </select>
            </label>
          </div>
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="stepper-group-title">{group.label}</h3>
              <div className="stepper-table-grid">
                {group.tables.map((table) => (
                  <button
                    className={`stepper-table-card ${table.id === selectedTableId ? "selected" : ""} ${table.status === "occupied" ? "occupied" : ""} ${table.status === "waiting_payment" ? "waiting" : ""}`}
                    type="button"
                    key={table.id}
                    onClick={() => setSelectedTableId(table.id)}
                  >
                    <strong>{table.code}</strong>
                    <span>{table.name}</span>
                    <small>
                      {table.seats} lugares · {tableStatusLabel(table.status)}
                    </small>
                    {group.label === "Outras mesas" ? (
                      <small>
                        Responsável: {assignmentByTable.get(table.id)?.waiterName ?? "outro garçom"}
                      </small>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {selectedAssignment && selectedAssignment.assignment.waiterUserId !== currentUserId ? (
            <button
              className="button secondary"
              disabled={busyLabel !== null}
              onClick={() => onRequestHelp(selectedTableId)}
              type="button"
            >
              Solicitar ajuda nesta mesa
            </button>
          ) : null}
        </>
      )}

      {serviceMode === "counter" && (
        <div className="stepper-counter-card">
          <strong>Balcão rápido</strong>
          <span>Pedidos sem mesa, retirada e atendimento direto. O fluxo segue auditado.</span>
        </div>
      )}

      <label className="platform-search">
        Pessoas
        <input
          inputMode="numeric"
          value={String(peopleCount)}
          onChange={(e) => setPeopleCount(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>

      <div>
        <div
          style={{ marginBottom: 8, fontWeight: 700, fontSize: "0.88rem", color: "var(--muted)" }}
        >
          Observações
        </div>
        <div className="stepper-note-presets">
          {notePresets.map((preset) => (
            <button
              className={`button ghost compact ${serviceNote === preset ? "active-note" : ""}`}
              type="button"
              key={preset}
              onClick={() => setServiceNote(serviceNote === preset ? "" : preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="platform-search" style={{ marginTop: 10 }}>
          Observação da mesa
          <input
            value={serviceNote}
            onChange={(e) => setServiceNote(e.target.value)}
            placeholder="alergia, aniversariante, prioridade..."
          />
        </label>
      </div>
    </div>
  );
}

/* ─── Step 2: Itens ─── */

function StepItens(props: {
  productFilter: ProductFilter;
  setProductFilter: (f: ProductFilter) => void;
  productQuery: string;
  setProductQuery: (q: string) => void;
  filteredProducts: Product[];
  order: OpenOrderResponse | null;
  items: OrderItemResponse[];
  totalCents: number;
  unsentCount: number;
  busyLabel: string | null;
  serviceMode: ServiceMode;
  selectedTable: DiningTable | undefined;
  peopleCount: number;
  serviceNote: string;
  onAddItem: (product: Product) => void;
  onToggleFavorite: (productId: string) => void;
  favorites: string[];
  onRepeatItem: (productId: string) => void;
  onSendToKitchen: () => void;
  pendingItems: PendingWaiterItem[];
  onRetryPending: () => void;
}) {
  const {
    productFilter,
    setProductFilter,
    productQuery,
    setProductQuery,
    filteredProducts,
    order,
    items,
    totalCents,
    unsentCount,
    busyLabel,
    serviceMode,
    selectedTable,
    peopleCount,
    serviceNote,
    onAddItem,
    onToggleFavorite,
    favorites,
    onRepeatItem,
    onSendToKitchen,
    pendingItems,
    onRetryPending,
  } = props;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h2 className="stepper-step-title">Itens</h2>
        <p className="stepper-step-subtitle">
          Adicione produtos ao pedido. Use busca e filtros para encontrar rápido.
        </p>
      </div>

      <div className="stepper-status-row">
        <div>
          <strong>{serviceMode === "counter" ? "Balcão" : (selectedTable?.code ?? "Mesa")}</strong>
          <span>
            {" "}
            · {peopleCount} pessoa(s) · {serviceNote.trim() || "sem observação"}
          </span>
        </div>
        <strong>{formatMoney(totalCents)}</strong>
      </div>

      <div className="stepper-status-row" role="status">
        <span>Itens aguardando envio</span>
        <strong>{unsentCount}</strong>
      </div>

      {pendingItems.length > 0 ? (
        <div className="stepper-status-row" role="status">
          <span>{pendingItems.length} item(ns) salvo(s) no rascunho deste aparelho.</span>
          <button
            className="button secondary compact"
            type="button"
            disabled={Boolean(busyLabel)}
            onClick={onRetryPending}
          >
            Reenviar agora
          </button>
        </div>
      ) : null}

      {order ? (
        <div className="stepper-status-row">
          <span>Status da comanda</span>
          <strong>{tableStatusLabel(order.status)}</strong>
        </div>
      ) : null}

      <div className="stepper-items-layout">
        <div style={{ display: "grid", gap: 12 }}>
          <div className="platform-toolbar">
            <label className="platform-search">
              Busca
              <div className="platform-search-input">
                <Search size={16} />
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Buscar item"
                />
              </div>
            </label>
            <label className="platform-search">
              Tipo
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value as ProductFilter)}
              >
                <option value="all">Todos</option>
                <option value="kitchen">Cozinha</option>
                <option value="drinks">Bebidas</option>
                <option value="dessert">Sobremesa</option>
                <option value="favorites">Favoritos</option>
                <option value="recent">Recentes</option>
              </select>
            </label>
          </div>

          <div className="stepper-product-grid">
            {filteredProducts.map((product) => (
              <div className="stepper-product-tile-wrap" key={product.id}>
                <button
                  className="stepper-product-tile"
                  type="button"
                  onClick={() => onAddItem(product)}
                  disabled={!order || Boolean(busyLabel)}
                >
                  <strong>{product.name}</strong>
                  <small>{product.description ?? "Item de venda"}</small>
                  <b>{formatMoney(product.priceCents)}</b>
                </button>
                <button
                  className="stepper-favorite"
                  type="button"
                  aria-label={
                    favorites.includes(product.id)
                      ? `Remover ${product.name} dos favoritos`
                      : `Favoritar ${product.name}`
                  }
                  onClick={() => onToggleFavorite(product.id)}
                >
                  <Star size={15} fill={favorites.includes(product.id) ? "currentColor" : "none"} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="stepper-ticket-preview">
          <div className="stepper-ticket-head">
            <span>Comanda</span>
            <strong>{formatMoney(totalCents)}</strong>
          </div>
          <div className="stepper-ticket-lines">
            {items.length > 0 ? (
              items.map((item) => (
                <div className="stepper-ticket-line" key={item.id}>
                  <span>{item.nameSnapshot}</span>
                  <div>
                    <strong>{formatMoney(item.totalCents)}</strong>
                    <button
                      className="button ghost compact"
                      type="button"
                      disabled={Boolean(busyLabel)}
                      onClick={() => onRepeatItem(item.productId)}
                    >
                      Repetir
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="stepper-ticket-empty">Toque nos itens para adicionar à comanda.</p>
            )}
          </div>
        </div>
      </div>
      <button
        className="button primary compact"
        type="button"
        onClick={onSendToKitchen}
        disabled={!order || items.length === 0 || Boolean(busyLabel)}
      >
        <Send size={16} /> Enviar para produção
      </button>
    </div>
  );
}

/* ─── Step 3: Pagamento ─── */

function StepPagamento(props: {
  order: OpenOrderResponse;
  items: OrderItemResponse[];
  totalCents: number;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  serviceMode: ServiceMode;
  selectedTable: DiningTable | undefined;
  peopleCount: number;
  serviceNote: string;
  busyLabel: string | null;
  paymentAmount: string;
  setPaymentAmount: (amount: string) => void;
  paidCents: number;
  remainingCents: number;
  onPay: () => void;
  onClose: () => void;
}) {
  const {
    order,
    items,
    totalCents,
    paymentMethod,
    setPaymentMethod,
    serviceMode,
    selectedTable,
    peopleCount,
    serviceNote,
    paymentAmount,
    setPaymentAmount,
    paidCents,
    remainingCents,
    busyLabel,
    onPay,
    onClose,
  } = props;

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 540 }}>
      <div>
        <h2 className="stepper-step-title">Pagamento</h2>
        <p className="stepper-step-subtitle">Revise o pedido e selecione a forma de pagamento.</p>
      </div>

      <div className="stepper-order-summary">
        <div className="stepper-order-summary-row">
          <span>{serviceMode === "counter" ? "Balcão" : (selectedTable?.code ?? "Mesa")}</span>
          <strong>{serviceMode === "counter" ? "Balcão" : (selectedTable?.name ?? "Mesa")}</strong>
        </div>
        <div className="stepper-order-summary-row">
          <span>Pessoas</span>
          <strong>{peopleCount}</strong>
        </div>
        {serviceNote.trim() && (
          <div className="stepper-order-summary-row">
            <span>Observação</span>
            <strong>{serviceNote.trim()}</strong>
          </div>
        )}
        <div className="stepper-order-summary-row">
          <span>Itens</span>
          <strong>{items.length}</strong>
        </div>
        {items.map((item) => (
          <div className="stepper-order-summary-row" key={item.id} style={{ fontSize: "0.88rem" }}>
            <span>{item.nameSnapshot}</span>
            <strong>{formatMoney(item.totalCents)}</strong>
          </div>
        ))}
        <div className="stepper-order-summary-row stepper-order-summary-total">
          <span>Total</span>
          <strong>{formatMoney(totalCents)}</strong>
        </div>
        <div className="stepper-order-summary-row">
          <span>Recebido</span>
          <strong>{formatMoney(paidCents)}</strong>
        </div>
        <div className="stepper-order-summary-row">
          <span>Restante</span>
          <strong>{formatMoney(remainingCents)}</strong>
        </div>
      </div>

      <div>
        <div
          style={{ marginBottom: 8, fontWeight: 700, fontSize: "0.88rem", color: "var(--muted)" }}
        >
          Forma de pagamento
        </div>
        <div className="stepper-payment-methods">
          {paymentMethods.map((method) => (
            <button
              className={`stepper-payment-btn ${paymentMethod === method.id ? "selected" : ""}`}
              type="button"
              key={method.id}
              onClick={() => setPaymentMethod(method.id)}
            >
              <strong>
                <method.icon size={18} /> {method.label}
              </strong>
            </button>
          ))}
        </div>
        <label className="platform-search" style={{ marginTop: 12 }}>
          Valor desta etapa
          <input
            inputMode="decimal"
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            placeholder={formatMoney(remainingCents)}
          />
        </label>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button
            className="button primary compact"
            type="button"
            onClick={onPay}
            disabled={Boolean(busyLabel) || remainingCents <= 0}
          >
            {busyLabel === "Recebendo" ? "Recebendo..." : "Registrar recebimento"}
          </button>
          <button
            className="button secondary compact"
            type="button"
            onClick={onClose}
            disabled={Boolean(busyLabel) || order.status !== "paid"}
          >
            Fechar conta
          </button>
        </div>
      </div>
    </div>
  );
}
