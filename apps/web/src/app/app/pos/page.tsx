"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import { ArrowLeft, BadgeDollarSign, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { demoProducts, demoTables } from "../../../lib/fixtures/app-dashboard-demo";
import { readCategoryLabel } from "../../../lib/formatters/app-dashboard";
import {
  addOrderItem,
  assignOrderCustomer,
  type Customer,
  type CustomerOrderHistory,
  closeOrder,
  type DiningTable,
  formatMoney,
  getSession,
  getTenantBranding,
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
  registerManualPayment,
  sendOrderToKitchen,
  type TenantBranding,
  type TenantSession,
} from "../../../lib/giromesa-api";

export default function PosPage() {
  const [session, setSession] = useState<TenantSession | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [currentOrder, setCurrentOrder] = useState<OpenOrderResponse | null>(null);
  const [ticketItems, setTicketItems] = useState<OrderItemResponse[]>([]);
  const [orderPayments, setOrderPayments] = useState<OrderPayment[]>([]);
  const [lastPaymentReceipt, setLastPaymentReceipt] = useState<PaymentResponse | null>(null);
  const [orderStatus, setOrderStatus] = useState("sem pedido aberto");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("Carregando PDV...");
  const [branding, setBranding] = useState<TenantBranding>({
    displayName: "GiroMesa",
    logoUrl: null,
    themeMode: "light",
    accentPreset: "emerald",
  });
  const [_posCustomers, setPosCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [_customerSearch, setCustomerSearch] = useState("");
  const [_customerHistory, _setCustomerHistory] = useState<CustomerOrderHistory[]>([]);
  const [customerDiscountPercent, _setCustomerDiscountPercent] = useState("");
  const [customerPreferences, _setCustomerPreferences] = useState("");
  const [orderNotes, _setOrderNotes] = useState("");
  const [paymentMethod, _setPaymentMethod] = useState<string>("pix_manual");
  const [paymentAmountMode, setPaymentAmountMode] = useState<"remaining" | "half" | "custom">(
    "remaining",
  );
  const [customPaymentAmount, setCustomPaymentAmount] = useState("");
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];

  useEffect(() => {
    void (async () => {
      try {
        const context = await getSession();
        setSession(context);
        const [apiProducts, apiTables, tenantBranding, customers] = await Promise.all([
          listProducts(),
          context.branchId ? listTables(context.branchId) : Promise.resolve([]),
          getTenantBranding(),
          listCustomers(),
        ]);
        const availableProducts =
          apiProducts.length > 0 ? apiProducts : context.isDemo ? demoProducts : [];
        const availableTables = apiTables.length > 0 ? apiTables : context.isDemo ? demoTables : [];
        const routeParams = new URLSearchParams(window.location.search);
        const requestedTableId = routeParams.get("tableId") ?? routeParams.get("table");

        setProducts(availableProducts);
        setTables(availableTables);
        setSelectedTableId((current) =>
          requestedTableId && availableTables.some((table) => table.id === requestedTableId)
            ? requestedTableId
            : availableTables.some((table) => table.id === current)
              ? current
              : (availableTables[0]?.id ?? ""),
        );
        setBranding(tenantBranding);
        setPosCustomers(customers);
        setMessage("PDV pronto.");
      } catch (error) {
        setProducts([]);
        setTables([]);
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar o PDV.");
      }
    })();
  }, []);

  const orderTotalCents = ticketItems.reduce((sum, item) => sum + item.totalCents, 0);
  const paidOrderTotalCents = orderPayments
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const effectiveOrderTotalCents =
    orderTotalCents > 0 ? orderTotalCents : (currentOrder?.totalCents ?? 0);
  const remainingOrderTotalCents = Math.max(0, effectiveOrderTotalCents - paidOrderTotalCents);

  async function ensureOrder() {
    if (!session?.branchId || !selectedTable) {
      throw new Error("Selecione uma mesa com sessão ativa.");
    }
    if (currentOrder) return currentOrder;
    const opened = await openOrder(
      session.branchId,
      selectedTable.id,
      2,
      selectedCustomerId || undefined,
    );
    setCurrentOrder(opened);
    setOrderStatus(opened.status);
    setOrderPayments([]);
    setLastPaymentReceipt(null);
    setPaymentAmountMode("remaining");
    setCustomPaymentAmount("");
    setTables((current) =>
      current.map((table) =>
        table.id === selectedTable.id ? { ...table, status: "occupied" } : table,
      ),
    );
    setMessage(`Pedido aberto em ${selectedTable.code}.`);
    return opened;
  }

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar ação.");
    } finally {
      setIsBusy(false);
    }
  }

  function openPrintDocument(html: string, title: string) {
    const popup = window.open("", "_blank", "width=1120,height=820");
    if (!popup) throw new Error(`Não foi possível abrir a janela de ${title}.`);
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function renderBrandingDocument(
    input: Parameters<typeof renderBrandedPrintDocument>[0],
    title: string,
  ) {
    openPrintDocument(renderBrandedPrintDocument(input), title);
  }

  async function addProductToOrder(product: Product, modifierIds: string[] = []) {
    const order = await ensureOrder();
    const notes = [
      orderNotes.trim(),
      customerPreferences.trim() ? `Preferências: ${customerPreferences.trim()}` : "",
      customerDiscountPercent.trim()
        ? `Desconto autorizado no atendimento: ${customerDiscountPercent.trim()}%`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");
    const item = await addOrderItem(
      order.id,
      product.id,
      modifierIds.map((optionId) => ({ optionId })),
      notes || undefined,
    );
    setTicketItems((current) => [...current, item]);
    setOrderStatus("opened");
    setMessage(`${item.nameSnapshot} lançado na comanda.`);
  }

  function handleAddItem(product: Product) {
    setSelectedProductId(product.id);
    void runAction(async () => {
      const groups = await listProductModifiers(product.id);
      if (groups.some((group) => group.options.length > 0)) {
        setModifierProduct(product);
        setModifierGroups(groups);
        setSelectedModifierIds([]);
        return;
      }
      await addProductToOrder(product);
    });
  }

  function handleSendToKitchen() {
    void runAction(async () => {
      const order = currentOrder ?? (await ensureOrder());
      if (ticketItems.length === 0) {
        throw new Error("Adicione ao menos um item antes de enviar a comanda para produção.");
      }
      const sent = await sendOrderToKitchen(order.id);
      setOrderStatus(sent.status);
      setMessage(`${sent.ticketsCreated.length} ticket(s) enviados para KDS.`);
    });
  }

  function handlePayment() {
    void runAction(async () => {
      if (!currentOrder) throw new Error("Abra uma mesa e lance um item antes de receber.");
      if (remainingOrderTotalCents <= 0) throw new Error("A conta ja foi totalmente recebida.");

      const suggestedPaymentAmountCents =
        paymentAmountMode === "half"
          ? Math.max(1, Math.ceil(remainingOrderTotalCents / 2))
          : paymentAmountMode === "custom"
            ? Math.round((Number(customPaymentAmount.replace(",", ".")) || 0) * 100)
            : remainingOrderTotalCents;

      if (suggestedPaymentAmountCents <= 0)
        throw new Error("Informe um valor valido para o pagamento.");
      if (suggestedPaymentAmountCents > remainingOrderTotalCents)
        throw new Error("O valor informado excede o saldo restante da conta.");

      const payment = await registerManualPayment(currentOrder.id, suggestedPaymentAmountCents, {
        method: paymentMethod,
      });
      setLastPaymentReceipt(payment);
      await refreshOrderPayments(currentOrder.id);
      setOrderStatus(payment.orderStatus);
      setMessage(`Pagamento ${payment.method} confirmado: ${formatMoney(payment.amountCents)}.`);
    });
  }

  function handleCloseOrder() {
    void runAction(async () => {
      if (!currentOrder) throw new Error("Nenhum pedido aberto para fechar.");
      if (orderStatus !== "paid") throw new Error("Receba o pagamento antes de fechar a conta.");
      await closeOrder(currentOrder.id);
      setMessage("Conta fechada.");
      setOrderStatus("closed");
      setCurrentOrder(null);
      setTicketItems([]);
      setOrderPayments([]);
      setLastPaymentReceipt(null);
      setTables((current) =>
        current.map((table) =>
          table.id === selectedTable?.id ? { ...table, status: "free" } : table,
        ),
      );
    });
  }

  function handleExportPaymentReceipt() {
    void runAction(async () => {
      if (!lastPaymentReceipt || !currentOrder)
        throw new Error("Receba um pagamento antes de gerar o comprovante.");
      renderBrandingDocument(
        {
          branding,
          documentLabel: "Comprovante",
          title: "Comprovante de pagamento",
          subtitle: "Registro de recebimento para conferência do cliente e do caixa.",
          metadata: [
            { label: "Pedido", value: currentOrder.id.slice(0, 8) },
            { label: "Mesa/Comanda", value: selectedTable?.code ?? "Balcão" },
            { label: "Emitido em", value: new Date().toLocaleString("pt-BR") },
          ],
          metrics: [
            { label: "Método", value: lastPaymentReceipt.method },
            { label: "Valor pago", value: formatMoney(lastPaymentReceipt.amountCents) },
            { label: "Status do pedido", value: lastPaymentReceipt.orderStatus },
          ],
          bodyHtml: `<section class="section"><h2>Resumo do recebimento</h2><table><tbody>
            <tr><th>Transacao</th><td>${escapeHtml(lastPaymentReceipt.id.slice(0, 8))}</td></tr>
            <tr><th>Total do pedido</th><td>${escapeHtml(formatMoney(orderTotalCents))}</td></tr>
            <tr><th>Valor recebido</th><td>${escapeHtml(formatMoney(lastPaymentReceipt.amountCents))}</td></tr>
          </tbody></table></section>`,
          footerNote: "Comprovante operacional emitido pelo GiroMesa.",
        },
        "comprovante",
      );
      setMessage("Comprovante de pagamento aberto para impressão.");
    });
  }

  async function refreshOrderPayments(orderId: string) {
    const rows = await listOrderPayments(orderId);
    setOrderPayments(rows);
  }

  function _handlePosCustomerSelect(customer: Customer) {
    setCustomerSearch(customer.name);
    setSelectedCustomerId(customer.id);
    void listCustomers()
      .then(setPosCustomers)
      .catch(() => setPosCustomers([]));
    if (currentOrder) {
      void runAction(async () => {
        await assignOrderCustomer(currentOrder.id, customer.id);
        setMessage("Cliente vinculado à comanda.");
      });
    }
  }

  const metrics = useMemo(
    () =>
      [
        ["Pedido", currentOrder ? currentOrder.id.slice(0, 8) : "Nenhum"],
        ["Status", orderStatus],
        ["Itens", String(ticketItems.length)],
        ["Total", formatMoney(orderTotalCents)],
      ] as const,
    [currentOrder, orderStatus, ticketItems.length, orderTotalCents],
  );

  return (
    <main className="pos-workspace">
      <header className="workspace-topbar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <div className="pos-metrics-bar">
          {metrics.map(([label, value]) => (
            <div className="pos-metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </header>
      <section className="pos-layout">
        <article className="pos-grid-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Produtos</span>
              <h2>Grade de venda</h2>
            </div>
          </div>
          <p className="muted-copy" role="status">
            {message}
          </p>
          <div className="pos-product-grid">
            {products.map((product) => (
              <button
                className={`pos-product-card ${selectedProductId === product.id ? "selected" : ""}`}
                key={product.id}
                onClick={() => handleAddItem(product)}
                disabled={isBusy}
                type="button"
              >
                <strong>{product.name}</strong>
                <span>{formatMoney(product.priceCents)}</span>
                <small>{readCategoryLabel(product)}</small>
              </button>
            ))}
            {!products.length ? (
              <p className="empty-state">Nenhum produto disponível nesta unidade.</p>
            ) : null}
          </div>
        </article>
        <article className="pos-ticket-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Comanda</span>
              <h2>{selectedTable ? `Mesa ${selectedTable.code}` : "Balcão"}</h2>
            </div>
            <span className={`gm-badge gm-badge-${currentOrder ? "good" : "warn"}`}>
              {orderStatus}
            </span>
          </div>
          <div className="pos-ticket-items">
            {ticketItems.length > 0 ? (
              ticketItems.map((item) => (
                <div className="pos-ticket-item" key={item.id}>
                  <div>
                    <strong>{item.nameSnapshot}</strong>
                    <small>{formatMoney(item.totalCents)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted-copy">Nenhum item lançado.</p>
            )}
          </div>
          <div className="pos-ticket-summary">
            <div>
              <span>Total</span>
              <strong>{formatMoney(orderTotalCents)}</strong>
            </div>
            <div>
              <span>Pago</span>
              <strong>{formatMoney(paidOrderTotalCents)}</strong>
            </div>
            <div>
              <span>Restante</span>
              <strong>{formatMoney(remainingOrderTotalCents)}</strong>
            </div>
          </div>
          <div className="pos-actions">
            <button
              className="button primary"
              onClick={handleSendToKitchen}
              disabled={isBusy || ticketItems.length === 0}
              type="button"
            >
              Enviar para cozinha
            </button>
            <button
              className="button secondary"
              onClick={handlePayment}
              disabled={isBusy || remainingOrderTotalCents <= 0}
              type="button"
            >
              <BadgeDollarSign size={16} /> Receber
            </button>
            <button
              className="button secondary"
              onClick={handleCloseOrder}
              disabled={isBusy || orderStatus !== "paid"}
              type="button"
            >
              <ShieldCheck size={16} /> Fechar conta
            </button>
            <button
              className="button secondary"
              onClick={handleExportPaymentReceipt}
              disabled={!lastPaymentReceipt}
              type="button"
            >
              <FileText size={16} /> Comprovante
            </button>
          </div>
        </article>
      </section>
      {modifierProduct ? (
        <div className="modifier-dialog">
          <div className="modifier-dialog-content">
            <h2>Selecione modificadores para {modifierProduct.name}</h2>
            {modifierGroups.map((group) => (
              <div key={group.id}>
                <h3>{group.name}</h3>
                {group.options.map((option) => (
                  <label key={option.id}>
                    <input
                      checked={selectedModifierIds.includes(option.id)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedModifierIds((current) => [...current, option.id]);
                        } else {
                          setSelectedModifierIds((current) =>
                            current.filter((id) => id !== option.id),
                          );
                        }
                      }}
                      type="checkbox"
                    />
                    {option.name}{" "}
                    {option.priceDeltaCents > 0 ? `(+${formatMoney(option.priceDeltaCents)})` : ""}
                  </label>
                ))}
              </div>
            ))}
            <div className="modifier-actions">
              <button
                className="button secondary"
                onClick={() => setModifierProduct(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button primary"
                onClick={() => {
                  if (!modifierProduct) return;
                  const product = modifierProduct;
                  setModifierProduct(null);
                  void runAction(() => addProductToOrder(product, selectedModifierIds));
                }}
                type="button"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
