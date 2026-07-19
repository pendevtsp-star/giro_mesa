import {
  Banknote,
  ChefHat,
  FileText,
  MessageSquareText,
  Percent,
  Phone,
  Printer,
  ReceiptText,
  UserRound,
  X,
} from "lucide-react";
import { demoTicketLines, paymentMethodOptions } from "../../lib/fixtures/app-dashboard-demo";
import { readQuantity } from "../../lib/formatters/app-dashboard";
import type {
  Customer,
  CustomerOrderHistory,
  DiningTable,
  ModifierGroup,
  OpenOrderResponse,
  OrderItemResponse,
  OrderPayment,
  Product,
} from "../../lib/giromesa-api";
import { formatMoney } from "../../lib/giromesa-api";

export type PaymentAmountMode = "remaining" | "half" | "custom";
export type PaymentMethod = (typeof paymentMethodOptions)[number][0];

type PosProductGridProps = {
  products: Product[];
  selectedProductId: string;
  disabled: boolean;
  onAddProduct: (product: Product) => void;
  readCategoryLabel: (product: Product) => string;
  readPrepTime: (name: string) => string;
};

export function PosProductGrid({
  products,
  selectedProductId,
  disabled,
  onAddProduct,
  readCategoryLabel,
  readPrepTime,
}: PosProductGridProps) {
  return (
    <div className="product-grid">
      {products.slice(0, 8).map((product, index) => (
        <button
          className={product.id === selectedProductId ? "product-tile selected" : "product-tile"}
          type="button"
          key={product.id}
          data-testid={index === 0 ? "pos-add-item" : undefined}
          onClick={() => onAddProduct(product)}
          disabled={disabled}
        >
          <span>{readCategoryLabel(product)}</span>
          <strong>{product.name}</strong>
          <small>
            {formatMoney(product.priceCents)} - {readPrepTime(product.name)}
          </small>
        </button>
      ))}
    </div>
  );
}

type PosTicketPreviewProps = {
  table: DiningTable | undefined;
  customerSearch: string;
  customers: Customer[];
  selectedCustomerId: string;
  customerHistory: CustomerOrderHistory[];
  customerDiscountPercent: string;
  customerPreferences: string;
  orderNotes: string;
  ticketItems: OrderItemResponse[];
  orderTotalCents: number;
  paidOrderTotalCents: number;
  remainingOrderTotalCents: number;
  suggestedPaymentAmountCents: number;
  paymentMethod: PaymentMethod;
  paymentAmountMode: PaymentAmountMode;
  customPaymentAmount: string;
  orderStatus: string;
  orderPayments: OrderPayment[];
  isBusy: boolean;
  currentOrder: OpenOrderResponse | null;
  hasLastPaymentReceipt: boolean;
  onCustomerSearchChange: (value: string) => void;
  onCustomerSelect: (customer: Customer) => void;
  onCustomerDiscountPercentChange: (value: string) => void;
  onCustomerPreferencesChange: (value: string) => void;
  onOrderNotesChange: (value: string) => void;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentAmountModeChange: (mode: PaymentAmountMode) => void;
  onCustomPaymentAmountChange: (value: string) => void;
  onSendToKitchen: () => void;
  onPayment: () => void;
  onExportPaymentReceipt: () => void;
  onPrintPaymentReceipt: () => void;
};

export function PosTicketPreview({
  table,
  customerSearch,
  customers,
  selectedCustomerId,
  customerHistory,
  customerDiscountPercent,
  customerPreferences,
  orderNotes,
  ticketItems,
  orderTotalCents,
  paidOrderTotalCents,
  remainingOrderTotalCents,
  suggestedPaymentAmountCents,
  paymentMethod,
  paymentAmountMode,
  customPaymentAmount,
  orderStatus,
  orderPayments,
  isBusy,
  currentOrder,
  hasLastPaymentReceipt,
  onCustomerSearchChange,
  onCustomerSelect,
  onCustomerDiscountPercentChange,
  onCustomerPreferencesChange,
  onOrderNotesChange,
  onPaymentMethodChange,
  onPaymentAmountModeChange,
  onCustomPaymentAmountChange,
  onSendToKitchen,
  onPayment,
  onExportPaymentReceipt,
  onPrintPaymentReceipt,
}: PosTicketPreviewProps) {
  const visibleLines = ticketItems.length > 0 ? ticketItems : demoTicketLines();
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const visibleCustomers = customers
    .filter((customer) => {
      if (!normalizedCustomerSearch) {
        return true;
      }
      return `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""}`
        .toLowerCase()
        .includes(normalizedCustomerSearch);
    })
    .slice(0, 5);

  return (
    <div className="ticket-preview">
      <div className="ticket-head">
        <ReceiptText size={18} />
        <strong>Comanda #{table?.code ?? "Balcão"}</strong>
      </div>
      <section className="pos-customer-box">
        <label className="pos-customer-select">
          Cliente
          <span>
            <UserRound size={16} />
            <input
              value={customerSearch}
              onChange={(event) => onCustomerSearchChange(event.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail"
            />
          </span>
        </label>
        {selectedCustomer ? (
          <div className="pos-selected-customer">
            <strong>{selectedCustomer.name}</strong>
            <span>{selectedCustomer.phone ?? selectedCustomer.email ?? "Cliente sem contato"}</span>
          </div>
        ) : null}
        {customerSearch || visibleCustomers.length ? (
          <div className="pos-customer-results">
            {visibleCustomers.map((customer) => (
              <button
                className={customer.id === selectedCustomerId ? "selected" : ""}
                key={customer.id}
                type="button"
                onClick={() => onCustomerSelect(customer)}
              >
                <strong>{customer.name}</strong>
                <span>
                  <Phone size={13} /> {customer.phone ?? customer.email ?? "sem contato"}
                </span>
              </button>
            ))}
            {!visibleCustomers.length ? (
              <p className="muted-copy">Nenhum cliente encontrado para a busca atual.</p>
            ) : null}
          </div>
        ) : null}
      </section>
      {selectedCustomerId ? (
        <div className="pos-customer-history">
          <strong>
            {customerHistory.length
              ? `Últimas ${Math.min(customerHistory.length, 3)} visitas`
              : "Sem consumo anterior"}
          </strong>
          {customerHistory.slice(0, 3).map((order) => (
            <span key={order.id}>
              {order.closedAt ? new Date(order.closedAt).toLocaleDateString("pt-BR") : "Em aberto"}{" "}
              · {formatMoney(order.totalCents)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="pos-order-context">
        <label>
          <Percent size={15} /> Desconto autorizado
          <input
            inputMode="decimal"
            value={customerDiscountPercent}
            onChange={(event) => onCustomerDiscountPercentChange(event.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          <UserRound size={15} /> Preferências
          <input
            value={customerPreferences}
            onChange={(event) => onCustomerPreferencesChange(event.target.value)}
            placeholder="Ex.: sem gelo, mesa externa"
          />
        </label>
        <label>
          <MessageSquareText size={15} /> Observação da comanda
          <input
            value={orderNotes}
            onChange={(event) => onOrderNotesChange(event.target.value)}
            placeholder="Observação enviada junto ao próximo item"
          />
        </label>
      </div>
      <div className="ticket-lines">
        {visibleLines.map((item) => (
          <div className="ticket-line" key={item.id}>
            <strong>{readQuantity(item.quantity)}</strong>
            <span>{item.nameSnapshot}</span>
            <small>{ticketItems.length > 0 ? "Lançado no pedido real" : "Item ilustrativo"}</small>
          </div>
        ))}
      </div>
      <div className="ticket-total">
        <span>Total parcial</span>
        <strong>{formatMoney(ticketItems.length > 0 ? orderTotalCents : 10000)}</strong>
      </div>
      <div className="payment-setup-grid">
        <label>
          Método
          <select
            value={paymentMethod}
            onChange={(event) => onPaymentMethodChange(event.target.value as PaymentMethod)}
          >
            {paymentMethodOptions.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={paymentAmountMode}
            onChange={(event) => onPaymentAmountModeChange(event.target.value as PaymentAmountMode)}
          >
            <option value="remaining">Quitar saldo</option>
            <option value="half">Metade do saldo</option>
            <option value="custom">Valor customizado</option>
          </select>
        </label>
        <label>
          Valor
          <input
            inputMode="decimal"
            value={
              paymentAmountMode === "custom"
                ? customPaymentAmount
                : (suggestedPaymentAmountCents / 100).toFixed(2).replace(".", ",")
            }
            onChange={(event) => onCustomPaymentAmountChange(event.target.value)}
            disabled={paymentAmountMode !== "custom"}
          />
        </label>
      </div>
      <div className="payment-breakdown">
        <div>
          <span>Pago</span>
          <strong>{formatMoney(paidOrderTotalCents)}</strong>
        </div>
        <div>
          <span>Restante</span>
          <strong>{formatMoney(remainingOrderTotalCents)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{orderStatus}</strong>
        </div>
      </div>
      <div className="ticket-actions">
        <button
          className="button secondary"
          type="button"
          data-testid="send-kds"
          onClick={onSendToKitchen}
          disabled={isBusy}
        >
          <ChefHat size={17} /> Enviar
        </button>
        <button
          className="button primary"
          type="button"
          data-testid="payment-complete"
          onClick={onPayment}
          disabled={isBusy || !currentOrder || remainingOrderTotalCents <= 0}
        >
          <Banknote size={17} /> Receber
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={onExportPaymentReceipt}
          disabled={isBusy || !hasLastPaymentReceipt || !currentOrder}
        >
          <FileText size={17} /> Comprovante
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={onPrintPaymentReceipt}
          disabled={isBusy || !hasLastPaymentReceipt || !currentOrder}
        >
          <Printer size={17} /> Comprovante físico
        </button>
      </div>
      {orderPayments.length > 0 ? (
        <div className="payment-ledger">
          {orderPayments.slice(0, 4).map((payment) => (
            <div className="status-row rich" key={payment.id}>
              <div>
                <strong>{payment.method}</strong>
                <span>
                  {payment.confirmedAt
                    ? new Date(payment.confirmedAt).toLocaleString("pt-BR")
                    : "sem confirmação"}
                </span>
              </div>
              <small>{formatMoney(payment.amountCents)}</small>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ModifierSelectorDialogProps = {
  product: Product;
  groups: ModifierGroup[];
  selectedModifierIds: string[];
  onSelectedModifierIdsChange: (updater: (current: string[]) => string[]) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ModifierSelectorDialog({
  product,
  groups,
  selectedModifierIds,
  onSelectedModifierIdsChange,
  onClose,
  onConfirm,
}: ModifierSelectorDialogProps) {
  return (
    <div className="modifier-modal-backdrop" role="presentation">
      <section
        className="modifier-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Opções de ${product.name}`}
      >
        <div className="panel-title">
          <div>
            <span className="section-kicker">Personalize o item</span>
            <h2>{product.name}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Fechar">
            <X size={18} />
          </button>
        </div>
        {groups.map((group) => (
          <fieldset className="modifier-choice-group" key={group.id}>
            <legend>
              {group.name} {group.isRequired ? "(obrigatório)" : ""}
            </legend>
            {group.options.map((option) => (
              <label key={option.id}>
                <input
                  checked={selectedModifierIds.includes(option.id)}
                  onChange={(event) =>
                    onSelectedModifierIdsChange((current) =>
                      event.target.checked
                        ? [
                            ...current.filter(
                              (id) => !group.options.some((item) => item.id === id),
                            ),
                            option.id,
                          ]
                        : current.filter((id) => id !== option.id),
                    )
                  }
                  type="checkbox"
                />{" "}
                <span>{option.name}</span>
                <strong>
                  {option.priceDeltaCents ? `+ ${formatMoney(option.priceDeltaCents)}` : "Incluído"}
                </strong>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="modifier-modal-actions">
          <button className="button secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button primary" onClick={onConfirm} type="button">
            Adicionar ao pedido
          </button>
        </div>
      </section>
    </div>
  );
}
