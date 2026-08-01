"use client";

import {
  ArrowLeft,
  Banknote,
  ChefHat,
  FileText,
  Keyboard,
  ReceiptText,
  Search,
  ShieldCheck,
  Star,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  demoProducts,
  demoTables,
  paymentMethodOptions,
} from "../../../lib/fixtures/app-dashboard-demo";
import { readCategoryLabel } from "../../../lib/formatters/app-dashboard";
import {
  addOrderItem,
  assignOrderCustomer,
  buildPosEventsUrl,
  type Category,
  type Customer,
  closeOrder,
  type DiningTable,
  formatMoney,
  getActiveOrder,
  getActiveOrderById,
  getProductionRoutingPreview,
  getSession,
  getTenantBranding,
  listCategories,
  listCustomers,
  listOrderPayments,
  listProductModifiers,
  listProducts,
  listTables,
  type ModifierGroup,
  type OpenOrderResponse,
  type OrderItemResponse,
  type OrderPayment,
  openOrder,
  type PaymentResponse,
  type Product,
  type ProductionRoutingPreview,
  printBillPreview,
  printPaymentReceipt,
  receiveCashHandover,
  registerManualPayment,
  requestItemCancellation,
  requestOrderDiscount,
  sendOrderToKitchen,
  splitOrderBill,
  type TenantBranding,
  type TenantSession,
} from "../../../lib/giromesa-api";

type ServiceMode = "table" | "counter";
type PaymentMethod = (typeof paymentMethodOptions)[number][0];
type PaymentAmountMode = "remaining" | "half" | "custom" | "split";
type OrderSnapshot = OpenOrderResponse & { items: OrderItemResponse[]; payments: OrderPayment[] };

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  opened: "Aberto",
  sent_to_kitchen: "Em produção",
  preparing: "Em preparo",
  ready: "Pronto",
  served: "Servido",
  partially_paid: "Pagamento parcial",
  paid: "Pago",
  closed: "Fechado",
  canceled: "Cancelado",
  refunded: "Estornado",
};

const methodLabels: Record<string, string> = Object.fromEntries(
  paymentMethodOptions.map(([value, label]) => [value, label]),
);

function statusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

function centsFromInput(value: string) {
  return Math.round((Number(value.replace(".", "").replace(",", ".")) || 0) * 100);
}

export default function PosPage() {
  const [session, setSession] = useState<TenantSession | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("table");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [counterOrderId, setCounterOrderId] = useState("");
  const [currentOrder, setCurrentOrder] = useState<OrderSnapshot | null>(null);
  const [orderStatus, setOrderStatus] = useState("opened");
  const [orderPayments, setOrderPayments] = useState<OrderPayment[]>([]);
  const [message, setMessage] = useState("Carregando atendimento...");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [customerPreferences, setCustomerPreferences] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [productionPreview, setProductionPreview] = useState<ProductionRoutingPreview | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix_manual");
  const [paymentMode, setPaymentMode] = useState<PaymentAmountMode>("remaining");
  const [customPayment, setCustomPayment] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [splitPeople, setSplitPeople] = useState("2");
  const [splitParts, setSplitParts] = useState<Array<{ person: number; amountCents: number }>>([]);
  const [lastPayment, setLastPayment] = useState<PaymentResponse | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [cancelItemId, setCancelItemId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const selectedTable = tables.find((table) => table.id === selectedTableId);
  const ticketItems = currentOrder?.items ?? [];
  const orderTotalCents =
    currentOrder?.totalCents ?? ticketItems.reduce((sum, item) => sum + item.totalCents, 0);
  const paidCents = orderPayments
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingCents = Math.max(0, orderTotalCents - paidCents);
  const hasPermission = (permission: string) => Boolean(session?.permissions.includes(permission));
  const canOperate = hasPermission("pos:operate");
  const canSend = hasPermission("pos:kds_send");
  const canPay = hasPermission("pos:payment_manage");
  const canClose = hasPermission("pos:close_order");

  const applyOrder = useCallback((order: OrderSnapshot | null) => {
    setCurrentOrder(order);
    setOrderStatus(order?.status ?? "opened");
    setOrderPayments(order?.payments ?? []);
    setSelectedCustomerId(order?.customerId ?? "");
  }, []);

  const loadOrder = useCallback(
    async (branchId: string, mode: ServiceMode, tableId: string, orderId: string) => {
      const order =
        mode === "table" && tableId
          ? await getActiveOrder(branchId, tableId)
          : orderId
            ? await getActiveOrderById(branchId, orderId)
            : null;
      applyOrder(order as OrderSnapshot | null);
      setMessage(
        order
          ? `Comanda ${order.id.slice(0, 8)} recuperada.`
          : "Nenhuma comanda aberta neste atendimento.",
      );
    },
    [applyOrder],
  );

  useEffect(() => {
    const storedFavorites = localStorage.getItem("gm_pos_favorites");
    if (storedFavorites) {
      try {
        setFavorites(JSON.parse(storedFavorites) as string[]);
      } catch {
        localStorage.removeItem("gm_pos_favorites");
      }
    }

    void (async () => {
      try {
        const context = await getSession();
        const [apiProducts, apiTables, apiCategories, tenantBranding, apiCustomers] =
          await Promise.all([
            listProducts(),
            context.branchId ? listTables(context.branchId) : Promise.resolve([]),
            listCategories(),
            getTenantBranding(),
            listCustomers(),
          ]);
        const availableProducts =
          apiProducts.length > 0 ? apiProducts : context.isDemo ? demoProducts : [];
        const availableTables = apiTables.length > 0 ? apiTables : context.isDemo ? demoTables : [];
        const route = new URLSearchParams(window.location.search);
        const requestedTableId = route.get("tableId") ?? route.get("table");
        const requestedOrderId = route.get("orderId");
        const requestedMode = route.get("mode") === "counter" ? "counter" : "table";
        setSession(context);
        setBranding(tenantBranding);
        setProducts(availableProducts);
        setTables(availableTables);
        setCategories(apiCategories);
        setCustomers(apiCustomers);
        setServiceMode(requestedTableId ? "table" : requestedMode);
        setSelectedTableId(requestedTableId ?? availableTables[0]?.id ?? "");
        setCounterOrderId(requestedOrderId ?? localStorage.getItem("gm_pos_counter_order") ?? "");
        if (context.branchId) {
          await loadOrder(
            context.branchId,
            requestedTableId ? "table" : requestedMode,
            requestedTableId ?? availableTables[0]?.id ?? "",
            requestedOrderId ?? localStorage.getItem("gm_pos_counter_order") ?? "",
          );
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar o PDV.");
      }
    })();
  }, [loadOrder]);

  useEffect(() => {
    if (!session?.branchId) return;
    const branchId = session.branchId;
    let events: EventSource | null = null;
    let connect: number | undefined;
    const scheduleConnection = () => {
      connect = window.setTimeout(() => {
        events = new EventSource(buildPosEventsUrl(branchId), { withCredentials: true });
        events.onmessage = () => {
          if (serviceMode === "table" && selectedTableId) {
            void loadOrder(branchId, serviceMode, selectedTableId, "");
          } else if (serviceMode === "counter" && counterOrderId) {
            void loadOrder(branchId, serviceMode, "", counterOrderId);
          }
        };
      }, 1500);
    };
    if (document.readyState === "complete") {
      scheduleConnection();
    } else {
      window.addEventListener("load", scheduleConnection, { once: true });
    }
    return () => {
      window.removeEventListener("load", scheduleConnection);
      if (connect !== undefined) window.clearTimeout(connect);
      events?.close();
    };
  }, [counterOrderId, loadOrder, selectedTableId, serviceMode, session?.branchId]);

  useEffect(() => {
    function isEditable(target: EventTarget | null) {
      return (
        target instanceof HTMLElement &&
        Boolean(target.closest("input, textarea, select, [contenteditable=true]"))
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShortcutsOpen(false);
        document.querySelector<HTMLButtonElement>(".modifier-dialog .icon-button")?.click();
        return;
      }
      if (isEditable(event.target)) return;

      const shortcuts: Record<string, string> = {
        F4: "F4",
        F8: "F8",
        F9: "F9",
        F10: "F10",
      };
      if (event.key === "F2") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Buscar produto"]')?.focus();
        return;
      }
      const button = shortcuts[event.key]
        ? document.querySelector<HTMLButtonElement>(
            `button[aria-keyshortcuts="${shortcuts[event.key]}"]`,
          )
        : null;
      if (button && !button.disabled) {
        event.preventDefault();
        button.click();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        `${product.name} ${product.description ?? ""}`.toLowerCase().includes(normalizedQuery);
      const matchesCategory = categoryId === "all" || product.categoryId === categoryId;
      const matchesFavorite = categoryId !== "favorites" || favorites.includes(product.id);
      return product.isAvailable !== false && matchesQuery && matchesCategory && matchesFavorite;
    });
  }, [categoryId, favorites, products, query]);

  async function ensureOrder() {
    if (!session?.branchId) throw new Error("Sessão operacional indisponível.");
    const branchId = session.branchId;
    if (currentOrder) return currentOrder;
    const opened = await (serviceMode === "table"
      ? selectedTable
        ? (async () => {
            const active = await getActiveOrder(branchId, selectedTable.id);
            return active ?? openNewOrder();
          })()
        : Promise.reject(new Error("Selecione uma mesa antes de lançar o pedido."))
      : openNewOrder());
    applyOrder(opened as OrderSnapshot);
    if (serviceMode === "counter") {
      setCounterOrderId(opened.id);
      localStorage.setItem("gm_pos_counter_order", opened.id);
    }
    setMessage(`Comanda ${serviceMode === "table" ? selectedTable?.code : "de balcão"} pronta.`);
    return opened as OrderSnapshot;

    function openNewOrder() {
      return openOrder(
        branchId,
        serviceMode === "table" ? selectedTable?.id : undefined,
        2,
        selectedCustomerId || undefined,
      );
    }
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar a operação.");
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(product: Product, modifierIds: string[] = []) {
    const order = await ensureOrder();
    const notes = [
      orderNotes.trim(),
      customerPreferences.trim() ? `Preferências: ${customerPreferences.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    const item = await addOrderItem(
      order.id,
      product.id,
      modifierIds.map((optionId) => ({ optionId })),
      notes || undefined,
      quantity,
    );
    applyOrder({
      ...order,
      status: "opened",
      totalCents: order.totalCents + item.totalCents,
      items: [...order.items, item],
      payments: order.payments,
    });
    setSelectedProduct(null);
    setQuantity(1);
    setMessage(`${item.nameSnapshot} adicionado ao rascunho.`);
  }

  function selectProduct(product: Product) {
    void runAction(async () => {
      const groups = await listProductModifiers(product.id);
      if (groups.some((group) => group.options.length > 0)) {
        setSelectedProduct(product);
        setModifierGroups(groups);
        setSelectedModifierIds([]);
        return;
      }
      await addProduct(product);
    });
  }

  async function refreshCurrentOrder() {
    if (!session?.branchId) return;
    await loadOrder(session.branchId, serviceMode, selectedTableId, counterOrderId);
  }

  async function syncOrderPayments(orderId: string, status?: PaymentResponse["orderStatus"]) {
    const payments = await listOrderPayments(orderId);
    setOrderPayments(payments);
    if (status) {
      setOrderStatus(status);
      setCurrentOrder((current) => (current ? { ...current, status } : current));
    }
  }

  function draftPaymentAmountCents() {
    return paymentMode === "remaining"
      ? remainingCents
      : paymentMode === "half"
        ? Math.ceil(remainingCents / 2)
        : centsFromInput(customPayment);
  }

  function openPayment() {
    if (!currentOrder) {
      setMessage("Abra uma mesa ou atendimento de balcão antes de receber.");
      return;
    }
    setPaymentMode("remaining");
    setCustomPayment("");
    setCashReceived("");
    setPaymentReference("");
    setSplitParts([]);
    setPaymentOpen(true);
  }

  async function calculateSplit() {
    if (!currentOrder) return;
    const people = Number(splitPeople);
    if (!Number.isInteger(people) || people < 2) throw new Error("Informe ao menos duas pessoas.");
    const result = await splitOrderBill(currentOrder.id, people);
    setSplitParts(result.parts);
    setPaymentMode("split");
    setCustomPayment(String((result.parts[0]?.amountCents ?? 0) / 100).replace(".", ","));
  }

  async function submitPayment() {
    if (!currentOrder) throw new Error("Nenhuma comanda aberta.");
    const amountCents = draftPaymentAmountCents();
    if (amountCents <= 0 || amountCents > remainingCents)
      throw new Error("O valor deve estar dentro do saldo restante.");
    if (paymentMethod === "cash" && centsFromInput(cashReceived) < amountCents)
      throw new Error("O valor recebido em dinheiro é menor que o pagamento.");
    const paymentInput = {
      method: paymentMethod,
      registeredVia: "cashier",
      idempotencyKey: `pos:${currentOrder.id}:${paymentMethod}:${amountCents}:${Date.now()}`,
      ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}),
    } as const;
    const payment = await registerManualPayment(currentOrder.id, amountCents, paymentInput);
    setLastPayment(payment);
    await syncOrderPayments(currentOrder.id, payment.orderStatus);
    setPaymentOpen(false);
    setMessage(
      `Pagamento confirmado: ${formatMoney(amountCents)} via ${methodLabels[paymentMethod]}.`,
    );
  }

  async function previewProduction() {
    if (!currentOrder) throw new Error("Abra uma comanda antes de enviar para produção.");
    const preview = await getProductionRoutingPreview(currentOrder.id);
    setProductionPreview(preview);
  }

  async function sendProduction() {
    if (!currentOrder) return;
    const sent = await sendOrderToKitchen(currentOrder.id);
    await refreshCurrentOrder();
    setProductionPreview(null);
    setMessage(`${sent.ticketsCreated.length} lote(s) enviado(s) para produção.`);
  }

  async function applyDiscount() {
    if (!currentOrder) throw new Error("Abra uma comanda antes de aplicar desconto.");
    const amountCents = centsFromInput(discountAmount);
    if (amountCents <= 0 || !discountReason.trim())
      throw new Error("Informe valor e motivo do desconto.");
    const result = await requestOrderDiscount(currentOrder.id, {
      amountCents,
      reason: discountReason.trim(),
    });
    setDiscountOpen(false);
    setDiscountAmount("");
    setDiscountReason("");
    await refreshCurrentOrder();
    setMessage(
      result.status === "pending_approval"
        ? "Desconto enviado para aprovação gerencial."
        : "Desconto aplicado à comanda.",
    );
  }

  async function cancelItem() {
    if (!currentOrder || !cancelItemId || !cancelReason.trim())
      throw new Error("Informe o motivo do cancelamento.");
    const result = await requestItemCancellation(
      currentOrder.id,
      cancelItemId,
      cancelReason.trim(),
    );
    setCancelItemId("");
    setCancelReason("");
    await refreshCurrentOrder();
    setMessage(
      result.status === "pending_approval"
        ? "Cancelamento enviado para aprovação gerencial."
        : "Item cancelado.",
    );
  }

  async function closeCurrentOrder() {
    if (!currentOrder) throw new Error("Nenhuma comanda aberta.");
    if (remainingCents > 0 || orderStatus !== "paid")
      throw new Error("Receba o saldo restante antes de fechar a conta.");
    await closeOrder(currentOrder.id);
    applyOrder(null);
    if (serviceMode === "counter") {
      setCounterOrderId("");
      localStorage.removeItem("gm_pos_counter_order");
    }
    setLastPayment(null);
    setMessage("Conta fechada e operação registrada.");
  }

  async function printReceipt(kind: "bill" | "payment") {
    if (!currentOrder) throw new Error("Nenhuma comanda aberta.");
    if (kind === "bill") await printBillPreview(currentOrder.id);
    else await printPaymentReceipt(currentOrder.id);
    setMessage(
      kind === "bill"
        ? "Pré-conta enviada para a fila de impressão."
        : "Comprovante enviado para a fila térmica.",
    );
  }

  async function receiveHandover(payment: OrderPayment) {
    if (!currentOrder) throw new Error("Nenhuma comanda aberta.");
    const result = await receiveCashHandover(payment.id);
    await syncOrderPayments(currentOrder.id, result.orderStatus);
    setMessage("Entrega de dinheiro conferida pelo caixa.");
  }

  const currentCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const customerOptions = customers
    .filter((customer) =>
      `${customer.name} ${customer.phone ?? ""}`
        .toLowerCase()
        .includes(customerQuery.toLowerCase()),
    )
    .slice(0, 6);

  return (
    <main className="pos-workspace pos-v3">
      <div className="pos-control-bar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <fieldset className="pos-mode-switch" aria-label="Tipo de atendimento">
          <button
            className={serviceMode === "table" ? "active" : ""}
            type="button"
            onClick={() =>
              void runAction(async () => {
                setServiceMode("table");
                await loadOrder(session?.branchId ?? "", "table", selectedTableId, "");
              })
            }
          >
            Mesa
          </button>
          <button
            className={serviceMode === "counter" ? "active" : ""}
            type="button"
            onClick={() =>
              void runAction(async () => {
                setServiceMode("counter");
                await loadOrder(session?.branchId ?? "", "counter", "", counterOrderId);
              })
            }
          >
            Balcão
          </button>
        </fieldset>
        {serviceMode === "table" ? (
          <label className="pos-table-select">
            Mesa
            <select
              value={selectedTableId}
              onChange={(event) =>
                void runAction(async () => {
                  setSelectedTableId(event.target.value);
                  await loadOrder(session?.branchId ?? "", "table", event.target.value, "");
                })
              }
            >
              <option value="">Selecione uma mesa</option>
              {tables.map((table) => (
                <option value={table.id} key={table.id}>
                  {table.code} · {table.seats} lugares · {statusLabel(table.status)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="pos-counter-label">Atendimento de balcão</span>
        )}
        <div className="pos-shortcuts">
          <button
            className="button ghost compact"
            type="button"
            aria-expanded={shortcutsOpen}
            onClick={() => setShortcutsOpen((value) => !value)}
          >
            <Keyboard size={15} /> Atalhos
          </button>
          {shortcutsOpen ? (
            <div className="pos-shortcuts-popover" role="note">
              <strong>Atalhos do PDV</strong>
              <span>
                <kbd>F2</kbd> buscar produto
              </span>
              <span>
                <kbd>F4</kbd> receber
              </span>
              <span>
                <kbd>F8</kbd> enviar para produção
              </span>
              <span>
                <kbd>F9</kbd> pré-conta
              </span>
              <span>
                <kbd>F10</kbd> fechar conta
              </span>
              <span>
                <kbd>Esc</kbd> fechar janela
              </span>
            </div>
          ) : null}
        </div>
        <span className="pos-feedback" role="status">
          {message}
        </span>
      </div>

      <section className="pos-layout">
        <article className="pos-grid-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Produtos</span>
              <h1>PDV do turno</h1>
            </div>
            <span className="pos-availability">{branding?.displayName ?? "GiroMesa"}</span>
          </div>
          <div className="pos-catalog-toolbar">
            <label className="pos-search">
              <Search size={17} />
              <input
                aria-label="Buscar produto"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar produto, SKU ou descrição"
              />
            </label>
            <button
              className={categoryId === "favorites" ? "pos-filter active" : "pos-filter"}
              type="button"
              onClick={() => setCategoryId("favorites")}
            >
              <Star size={15} /> Favoritos
            </button>
          </div>
          <div className="pos-category-row">
            <button
              className={categoryId === "all" ? "active" : ""}
              type="button"
              onClick={() => setCategoryId("all")}
            >
              Todos
            </button>
            {categories
              .filter((category) => category.isActive)
              .map((category) => (
                <button
                  className={categoryId === category.id ? "active" : ""}
                  type="button"
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))}
          </div>
          <div className="pos-product-grid">
            {visibleProducts.map((product) => {
              const favorite = favorites.includes(product.id);
              return (
                <div className="pos-product-card-wrap" key={product.id}>
                  <button
                    className="pos-product-favorite"
                    type="button"
                    aria-label={
                      favorite
                        ? `Remover ${product.name} dos favoritos`
                        : `Adicionar ${product.name} aos favoritos`
                    }
                    onClick={() => {
                      const next = favorite
                        ? favorites.filter((id) => id !== product.id)
                        : [...favorites, product.id];
                      setFavorites(next);
                      localStorage.setItem("gm_pos_favorites", JSON.stringify(next));
                    }}
                  >
                    <Star size={14} fill={favorite ? "currentColor" : "none"} />
                  </button>
                  <button
                    className="pos-product-card"
                    type="button"
                    data-testid="pos-add-item"
                    disabled={busy || !canOperate}
                    onClick={() => selectProduct(product)}
                  >
                    <strong>{product.name}</strong>
                    <span>{formatMoney(product.priceCents)}</span>
                    <small>{readCategoryLabel(product)}</small>
                  </button>
                </div>
              );
            })}
            {!visibleProducts.length ? (
              <p className="empty-state">Nenhum produto disponível para este filtro.</p>
            ) : null}
          </div>
        </article>

        <article className="pos-ticket-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Comanda</span>
              <h2>
                {serviceMode === "table"
                  ? (selectedTable?.code ?? "Mesa não selecionada")
                  : "Balcão"}
              </h2>
              <p className="muted-copy">
                {currentCustomer
                  ? `${currentCustomer.name} · atendimento atual`
                  : "Atendimento sem cliente identificado"}
              </p>
            </div>
            <span className={`gm-badge gm-badge-${currentOrder ? "good" : "warn"}`}>
              {statusLabel(orderStatus)}
            </span>
          </div>
          <div className="pos-customer-box">
            <label>
              Cliente{" "}
              <input
                aria-label="Buscar cliente"
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Nome ou telefone"
              />
            </label>
            {customerQuery && customerOptions.length ? (
              <div className="pos-customer-results">
                {customerOptions.map((customer) => (
                  <button
                    type="button"
                    key={customer.id}
                    onClick={() =>
                      void runAction(async () => {
                        setSelectedCustomerId(customer.id);
                        setCustomerQuery(customer.name);
                        if (currentOrder) await assignOrderCustomer(currentOrder.id, customer.id);
                      })
                    }
                  >
                    <UserRound size={14} /> {customer.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="pos-ticket-items">
            {ticketItems.length ? (
              ticketItems.map((item) => (
                <div className="pos-ticket-item" key={item.id}>
                  <div>
                    <strong>
                      {item.quantity}× {item.nameSnapshot}
                    </strong>
                    <small>
                      {formatMoney(item.totalCents)} ·{" "}
                      {item.status ? statusLabel(item.status) : "Rascunho"}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    title="Cancelar item"
                    onClick={() => setCancelItemId(item.id)}
                  >
                    <X size={15} />
                  </button>
                  {cancelItemId === item.id ? (
                    <div className="pos-inline-form">
                      <input
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder="Motivo do cancelamento"
                      />
                      <button
                        className="button danger compact"
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(cancelItem)}
                      >
                        Confirmar
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="muted-copy">Nenhum item lançado. Selecione um produto para começar.</p>
            )}
          </div>
          <div className="pos-order-notes">
            <input
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              placeholder="Observação para os próximos itens"
            />
            <input
              value={customerPreferences}
              onChange={(event) => setCustomerPreferences(event.target.value)}
              placeholder="Preferências do cliente"
            />
          </div>
          <div className="pos-ticket-summary">
            <div>
              <span>Total</span>
              <strong>{formatMoney(orderTotalCents)}</strong>
            </div>
            <div>
              <span>Recebido</span>
              <strong>{formatMoney(paidCents)}</strong>
            </div>
            <div>
              <span>Restante</span>
              <strong>{formatMoney(remainingCents)}</strong>
            </div>
          </div>
          <div className="pos-actions">
            <button
              className="button primary"
              type="button"
              aria-keyshortcuts="F8"
              disabled={busy || !currentOrder || !ticketItems.length || !canSend}
              onClick={() => void runAction(previewProduction)}
            >
              <ChefHat size={16} /> Enviar para produção
            </button>
            <button
              className="button secondary"
              type="button"
              aria-keyshortcuts="F4"
              disabled={busy || !currentOrder || !canPay || remainingCents <= 0}
              onClick={openPayment}
            >
              <Banknote size={16} /> Receber
            </button>
            <button
              className="button secondary"
              type="button"
              aria-keyshortcuts="F10"
              disabled={busy || !currentOrder || remainingCents > 0 || !canClose}
              onClick={() => void runAction(closeCurrentOrder)}
            >
              <ShieldCheck size={16} /> Fechar conta
            </button>
            <button
              className="button ghost"
              type="button"
              aria-keyshortcuts="F9"
              disabled={!currentOrder}
              onClick={() => void runAction(() => printReceipt("bill"))}
            >
              <ReceiptText size={16} /> Pré-conta
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={!currentOrder || !lastPayment}
              onClick={() => void runAction(() => printReceipt("payment"))}
            >
              <FileText size={16} /> Comprovante térmico
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={!currentOrder}
              onClick={() => setDiscountOpen((value) => !value)}
            >
              <Tag size={16} /> Desconto
            </button>
          </div>
          {discountOpen ? (
            <div className="pos-inline-form pos-discount-form">
              <input
                inputMode="decimal"
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                placeholder="Valor do desconto"
              />
              <input
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
                placeholder="Motivo"
              />
              <button
                className="button primary compact"
                type="button"
                disabled={busy}
                onClick={() => void runAction(applyDiscount)}
              >
                Solicitar
              </button>
            </div>
          ) : null}
          {orderPayments.length ? (
            <div className="payment-ledger">
              <strong>Histórico de recebimentos</strong>
              {orderPayments.map((payment) => (
                <div className="status-row rich" key={payment.id}>
                  <span>
                    {methodLabels[payment.method] ?? payment.method} ·{" "}
                    {formatMoney(payment.amountCents)}
                    {payment.cashHandoverStatus === "pending" ? " · aguardando conferência" : ""}
                  </span>
                  {payment.cashHandoverStatus === "pending" && hasPermission("cash:manage") ? (
                    <button
                      className="button ghost compact"
                      type="button"
                      onClick={() => void runAction(() => receiveHandover(payment))}
                    >
                      Conferir dinheiro
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </section>

      {selectedProduct ? (
        <div className="modifier-dialog">
          <div className="modifier-dialog-content">
            <button
              className="icon-button"
              type="button"
              onClick={() => setSelectedProduct(null)}
              aria-label="Fechar modificadores"
            >
              <X size={18} />
            </button>
            <h2>{selectedProduct.name}</h2>
            <label>
              Quantidade
              <input
                type="number"
                min="1"
                max="99"
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            {modifierGroups.map((group) => (
              <fieldset key={group.id}>
                <legend>
                  {group.name}
                  {group.isRequired ? " · obrigatório" : ""}
                </legend>
                {group.options.map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={selectedModifierIds.includes(option.id)}
                      onChange={(event) =>
                        setSelectedModifierIds((current) =>
                          event.target.checked
                            ? [
                                ...current.filter(
                                  (id) => !group.options.some((entry) => entry.id === id),
                                ),
                                option.id,
                              ]
                            : current.filter((id) => id !== option.id),
                        )
                      }
                    />
                    {option.name}
                    <span>
                      {option.priceDeltaCents
                        ? `+ ${formatMoney(option.priceDeltaCents)}`
                        : "Incluído"}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="modifier-actions">
              <button
                className="button ghost"
                type="button"
                onClick={() => setSelectedProduct(null)}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() =>
                  void runAction(() => addProduct(selectedProduct, selectedModifierIds))
                }
              >
                Adicionar à comanda
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productionPreview ? (
        <div className="modifier-dialog">
          <div className="modifier-dialog-content">
            <button
              className="icon-button"
              type="button"
              onClick={() => setProductionPreview(null)}
              aria-label="Fechar prévia"
            >
              <X size={18} />
            </button>
            <span className="section-kicker">
              <ChefHat size={15} /> Rotas de produção
            </span>
            <h2>Conferir envio</h2>
            {productionPreview.destinations.map((destination) => (
              <div className="pos-routing-row" key={destination.stationId}>
                <strong>{destination.stationName}</strong>
                <span>
                  {destination.itemIds.length} item(ns) ·{" "}
                  {destination.outputMode === "printer"
                    ? "impressora térmica"
                    : destination.outputMode === "hybrid"
                      ? "KDS + impressora"
                      : "KDS"}
                </span>
              </div>
            ))}
            {productionPreview.unroutedItems.length ? (
              <p className="danger-text">
                Itens sem rota:{" "}
                {productionPreview.unroutedItems.map((item) => item.nameSnapshot).join(", ")}
              </p>
            ) : (
              <div className="modifier-actions">
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setProductionPreview(null)}
                >
                  Voltar
                </button>
                <button
                  className="button primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(sendProduction)}
                >
                  Enviar agora
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {paymentOpen ? (
        <div className="modifier-dialog">
          <div className="modifier-dialog-content pos-payment-drawer">
            <button
              className="icon-button"
              type="button"
              onClick={() => setPaymentOpen(false)}
              aria-label="Fechar recebimento"
            >
              <X size={18} />
            </button>
            <span className="section-kicker">
              <Banknote size={15} /> Recebimento
            </span>
            <h2>{formatMoney(remainingCents)} restantes</h2>
            <div className="payment-method-grid">
              {paymentMethodOptions.map(([value, label]) => (
                <button
                  className={paymentMethod === value ? "active" : ""}
                  type="button"
                  key={value}
                  onClick={() => setPaymentMethod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Divisão
              <select
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value as PaymentAmountMode)}
              >
                <option value="remaining">Receber saldo total</option>
                <option value="half">Receber metade</option>
                <option value="custom">Informar valor</option>
                <option value="split">Dividir por pessoas</option>
              </select>
            </label>
            {paymentMode === "split" ? (
              <div className="pos-split-row">
                <input
                  type="number"
                  min="2"
                  value={splitPeople}
                  onChange={(event) => setSplitPeople(event.target.value)}
                />
                <button
                  className="button ghost compact"
                  type="button"
                  onClick={() => void runAction(calculateSplit)}
                >
                  Calcular divisão
                </button>
                {splitParts.length ? <span>{splitParts.length} partes calculadas</span> : null}
              </div>
            ) : null}
            <label>
              Valor
              <input
                inputMode="decimal"
                value={
                  paymentMode === "remaining"
                    ? (remainingCents / 100).toFixed(2).replace(".", ",")
                    : paymentMode === "half"
                      ? (Math.ceil(remainingCents / 2) / 100).toFixed(2).replace(".", ",")
                      : customPayment
                }
                disabled={paymentMode === "remaining" || paymentMode === "half"}
                onChange={(event) => setCustomPayment(event.target.value)}
              />
            </label>
            {paymentMethod === "cash" ? (
              <label>
                Valor recebido
                <input
                  inputMode="decimal"
                  value={cashReceived}
                  onChange={(event) => setCashReceived(event.target.value)}
                  placeholder="Ex.: 100,00"
                />
                {cashReceived && centsFromInput(cashReceived) >= draftPaymentAmountCents() ? (
                  <small>
                    Troco: {formatMoney(centsFromInput(cashReceived) - draftPaymentAmountCents())}
                  </small>
                ) : null}
              </label>
            ) : null}
            <label>
              Referência (opcional)
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="NSU, comprovante ou observação"
              />
            </label>
            <div className="modifier-actions">
              <button className="button ghost" type="button" onClick={() => setPaymentOpen(false)}>
                Cancelar
              </button>
              <button
                className="button primary"
                type="button"
                disabled={busy || !canPay}
                onClick={() => void runAction(submitPayment)}
              >
                Confirmar recebimento
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
