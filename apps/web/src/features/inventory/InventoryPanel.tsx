import { PackageOpen, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { InventoryAlert, InventorySummaryItem } from "../../lib/giromesa-api";

type InventoryForm = {
  name: string;
  unit: string;
  averageCost: string;
  minQuantity: string;
  allowNegative: boolean;
};

type StockAdjustmentForm = {
  inventoryItemId: string;
  quantity: string;
  reason: string;
};

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

export function InventoryPanel({
  inventorySummary,
  inventoryAlerts,
  inventoryForm,
  stockAdjustmentForm,
  isBusy,
  demoInventoryRows,
  onInventoryFormChange,
  onStockAdjustmentFormChange,
  onCreateInventoryItem,
  onAdjustStock,
}: {
  inventorySummary: InventorySummaryItem[];
  inventoryAlerts: InventoryAlert[];
  inventoryForm: InventoryForm;
  stockAdjustmentForm: StockAdjustmentForm;
  isBusy: boolean;
  demoInventoryRows: () => InventorySummaryItem[];
  onInventoryFormChange: (updater: (current: InventoryForm) => InventoryForm) => void;
  onStockAdjustmentFormChange: (
    updater: (current: StockAdjustmentForm) => StockAdjustmentForm,
  ) => void;
  onCreateInventoryItem: () => void;
  onAdjustStock: () => void;
}) {
  return (
    <article className="panel inventory-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Estoque</span>
          <h2>Fichas técnicas e saldos</h2>
        </div>
        <Badge tone={inventoryAlerts.length > 0 ? "danger" : "warn"}>
          {inventoryAlerts.length > 0
            ? `${inventoryAlerts.length} alerta(s)`
            : `${inventorySummary.length} insumos`}
        </Badge>
      </div>
      <div className="hardware-forms">
        <form
          className="hardware-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateInventoryItem();
          }}
        >
          <strong>Novo insumo</strong>
          <div className="form-grid-compact">
            <label>
              Nome
              <input
                value={inventoryForm.name}
                onChange={(event) =>
                  onInventoryFormChange((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              Unidade
              <input
                value={inventoryForm.unit}
                onChange={(event) =>
                  onInventoryFormChange((current) => ({ ...current, unit: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="form-grid-compact">
            <label>
              Custo médio
              <input
                inputMode="decimal"
                value={inventoryForm.averageCost}
                onChange={(event) =>
                  onInventoryFormChange((current) => ({
                    ...current,
                    averageCost: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Mínimo
              <input
                inputMode="decimal"
                value={inventoryForm.minQuantity}
                onChange={(event) =>
                  onInventoryFormChange((current) => ({
                    ...current,
                    minQuantity: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button className="button secondary full" type="submit" disabled={isBusy}>
            <PackageOpen size={17} /> Cadastrar insumo
          </button>
        </form>
        <form
          className="hardware-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAdjustStock();
          }}
        >
          <strong>Ajuste auditado</strong>
          <label>
            Insumo
            <select
              value={stockAdjustmentForm.inventoryItemId}
              onChange={(event) =>
                onStockAdjustmentFormChange((current) => ({
                  ...current,
                  inventoryItemId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {inventorySummary.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid-compact">
            <label>
              Quantidade
              <input
                inputMode="decimal"
                value={stockAdjustmentForm.quantity}
                onChange={(event) =>
                  onStockAdjustmentFormChange((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Motivo
              <input
                value={stockAdjustmentForm.reason}
                onChange={(event) =>
                  onStockAdjustmentFormChange((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button className="button secondary full" type="submit" disabled={isBusy}>
            <ShieldCheck size={17} /> Registrar movimento
          </button>
        </form>
      </div>
      {inventoryAlerts.length > 0 ? (
        <div className="inventory-alerts">
          {inventoryAlerts.slice(0, 3).map((alert) => (
            <div className="inventory-row" key={alert.id}>
              <div>
                <strong>{alert.name}</strong>
                <span>
                  {alert.status === "negative" ? "Saldo negativo" : "Abaixo do mínimo"} - falta{" "}
                  {alert.shortage.toFixed(3)} {alert.unit}
                </span>
              </div>
              <Badge tone="danger">
                {alert.quantity} / {alert.minQuantity}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
      <div className="inventory-list">
        {(inventorySummary.length > 0 ? inventorySummary : demoInventoryRows()).map((item) => {
          const current = Number(item.quantity);
          const minimum = Number(item.minQuantity);
          return (
            <div className="inventory-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  Mínimo {item.minQuantity} {item.unit}
                </span>
              </div>
              <Badge tone={current < minimum ? "danger" : "good"}>
                {item.quantity} {item.unit}
              </Badge>
            </div>
          );
        })}
      </div>
    </article>
  );
}
