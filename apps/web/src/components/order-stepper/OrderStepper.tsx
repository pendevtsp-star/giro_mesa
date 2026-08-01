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
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addOrderItem,
  closeOrder,
  type DiningTable,
  formatMoney,
  getActiveOrder,
  getSession,
  getTenantBranding,
  listOrderPayments,
  listProducts,
  listTables,
  type OpenOrderResponse,
  type OrderItemResponse,
  type OrderPayment,
  openOrder,
  type Product,
  registerManualPayment,
  sendOrderToKitchen,
  type TenantBranding,
  type TenantSession,
} from "../../lib/giromesa-api";

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
type ProductFilter = "all" | "kitchen" | "drinks" | "dessert";
type ServiceMode = "table" | "counter";
type PaymentMethod = "pix" | "credit_card" | "debit_card" | "cash";

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
      const matchesFilter = productFilter === "all" ? true : productKind(product) === productFilter;
      return matchesQuery && matchesFilter;
    });
  }, [productFilter, productQuery, products]);

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
      const [tableList, productList, tenantBranding] = await Promise.all([
        listTables(activeSession.branchId),
        listProducts(),
        getTenantBranding(),
      ]);
      const nextTables = tableList.length > 0 ? tableList : activeSession.isDemo ? demoTables : [];
      const nextProducts = productList.filter((p) => p.isAvailable).slice(0, 24);
      setTables(nextTables);
      setProducts(
        nextProducts.length > 0 ? nextProducts : activeSession.isDemo ? demoProducts : [],
      );
      setBranding(tenantBranding);
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

  async function run(label: string, action: () => Promise<void>) {
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
      const opened =
        active ??
        (await openOrder(
          branchId,
          serviceMode === "table" ? selectedTable?.id : undefined,
          peopleCount,
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

  function handleAddItem(product: Product) {
    void run("Lancando item", async () => {
      if (!order) {
        setMessage("Abra a mesa antes de lançar itens.");
        return;
      }
      const item = await addOrderItem(
        order.id,
        product.id,
        [],
        serviceNote.trim() || "Lançado pelo garçom",
      );
      setItems((current) => [...current, item]);
      setOrder((current) =>
        current
          ? { ...current, status: "opened", totalCents: current.totalCents + item.totalCents }
          : current,
      );
      setMessage(`${product.name} lançado na conta.`);
    });
  }

  function handleSendToKitchen() {
    void run("Enviando para produção", async () => {
      if (!order || items.length === 0) {
        setMessage("Lance ao menos um item antes de enviar para produção.");
        return;
      }
      const sent = await sendOrderToKitchen(order.id);
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
      const payment = await registerManualPayment(order.id, amount, {
        method: methodMap[paymentMethod],
        registeredVia: "waiter",
        idempotencyKey: `waiter:${order.id}:${amount}:${methodMap[paymentMethod]}`,
      });
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
      await closeOrder(order.id);
      setOrder(null);
      setItems([]);
      setPayments([]);
      setStep(1);
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
            busyLabel={busyLabel}
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            peopleCount={peopleCount}
            serviceNote={serviceNote}
            onAddItem={handleAddItem}
            onSendToKitchen={handleSendToKitchen}
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
  } = props;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h2 className="stepper-step-title">Mesa</h2>
        <p className="stepper-step-subtitle">Selecione a mesa ou abra um atendimento de balcão.</p>
      </div>

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
          <div className="stepper-table-grid">
            {filteredTables.map((table) => (
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
              </button>
            ))}
          </div>
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
  busyLabel: string | null;
  serviceMode: ServiceMode;
  selectedTable: DiningTable | undefined;
  peopleCount: number;
  serviceNote: string;
  onAddItem: (product: Product) => void;
  onSendToKitchen: () => void;
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
    busyLabel,
    serviceMode,
    selectedTable,
    peopleCount,
    serviceNote,
    onAddItem,
    onSendToKitchen,
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
              </select>
            </label>
          </div>

          <div className="stepper-product-grid">
            {filteredProducts.map((product) => (
              <button
                className="stepper-product-tile"
                type="button"
                key={product.id}
                onClick={() => onAddItem(product)}
                disabled={!order || Boolean(busyLabel)}
              >
                <strong>{product.name}</strong>
                <small>{product.description ?? "Item de venda"}</small>
                <b>{formatMoney(product.priceCents)}</b>
              </button>
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
                  <strong>{formatMoney(item.totalCents)}</strong>
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
