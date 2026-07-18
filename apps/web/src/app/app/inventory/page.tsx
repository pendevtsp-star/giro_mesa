"use client";

import { Boxes, ClipboardCheck, PackagePlus, TriangleAlert } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  adjustInventoryStock,
  createInventoryItem,
  formatMoney,
  getSession,
  type InventoryAlert,
  type InventoryMovement,
  type InventorySummaryItem,
  listInventoryAlerts,
  listInventoryMovements,
  listInventorySummary,
} from "../../../lib/giromesa-api";

const movementLabels: Record<InventoryMovement["type"], string> = {
  purchase_receipt: "Entrada",
  loss: "Perda",
  inventory_count: "Inventário",
  manual_adjustment: "Ajuste",
};

export default function InventoryPage() {
  const [branchId, setBranchId] = useState("");
  const [items, setItems] = useState<InventorySummaryItem[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [message, setMessage] = useState("Carregando posição do estoque...");
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    unit: "un",
    minQuantity: "0",
    averageCost: "",
  });
  const [movement, setMovement] = useState({
    inventoryItemId: "",
    type: "purchase_receipt" as InventoryMovement["type"],
    quantity: "",
    unitCost: "",
    reason: "",
  });

  async function refresh(activeBranchId = branchId) {
    if (!activeBranchId) return;
    try {
      const [summary, alertRows, movementRows] = await Promise.all([
        listInventorySummary(activeBranchId),
        listInventoryAlerts(activeBranchId),
        listInventoryMovements(activeBranchId),
      ]);
      setItems(summary);
      setAlerts(alertRows);
      setMovements(movementRows);
      setMessage(`${summary.length} insumos acompanhados nesta unidade.`);
    } catch {
      setMessage("Entre com uma conta de gestão de estoque para consultar os dados reais.");
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: bootstrap da filial de estoque ao abrir a tela.
  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error();
        setBranchId(session.branchId);
        await refresh(session.branchId);
      } catch {
        setMessage("Entre com uma conta de gestão de estoque para consultar os dados reais.");
      }
    })();
  }, []);

  const totalValue = useMemo(
    () =>
      items.reduce(
        (total, item) => total + Math.max(Number(item.quantity), 0) * item.averageCostCents,
        0,
      ),
    [items],
  );

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newItem.name.trim()) return;
    setBusy(true);
    try {
      await createInventoryItem({
        name: newItem.name.trim(),
        unit: newItem.unit,
        minQuantity: newItem.minQuantity || "0",
        averageCostCents: Math.round((Number(newItem.averageCost.replace(",", ".")) || 0) * 100),
      });
      setNewItem({ name: "", unit: "un", minQuantity: "0", averageCost: "" });
      await refresh();
      setMessage("Insumo cadastrado. Registre a primeira entrada para compor o saldo.");
    } catch {
      setMessage("Não foi possível cadastrar o insumo.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !branchId ||
      !movement.inventoryItemId ||
      !movement.quantity ||
      movement.reason.trim().length < 5
    ) {
      setMessage(
        "Selecione o insumo, informe quantidade e uma justificativa de ao menos 5 caracteres.",
      );
      return;
    }
    setBusy(true);
    try {
      await adjustInventoryStock({
        branchId,
        inventoryItemId: movement.inventoryItemId,
        type: movement.type,
        quantity: movement.quantity,
        reason: movement.reason.trim(),
        ...(movement.unitCost
          ? { unitCostCents: Math.round(Number(movement.unitCost.replace(",", ".")) * 100) }
          : {}),
      });
      setMovement({
        inventoryItemId: "",
        type: "purchase_receipt",
        quantity: "",
        unitCost: "",
        reason: "",
      });
      await refresh();
      setMessage("Movimento registrado e auditado no estoque.");
    } catch {
      setMessage("Não foi possível registrar o movimento. Confira o saldo e as permissões.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page inventory-workspace">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <a className="button secondary" href="/app/catalog">
          Cadastros
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Boxes size={16} /> Estoque
        </span>
        <h1>Controle de insumos</h1>
        <p>{message}</p>
      </section>
      <section className="inventory-metrics">
        <article>
          <span>Itens monitorados</span>
          <strong>{items.length}</strong>
        </article>
        <article>
          <span>Alertas ativos</span>
          <strong>{alerts.length}</strong>
        </article>
        <article>
          <span>Valor estimado</span>
          <strong>{formatMoney(totalValue)}</strong>
        </article>
      </section>
      <section className="catalog-layout inventory-layout">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <PackagePlus size={15} /> Base
              </span>
              <h2>Novo insumo</h2>
            </div>
          </div>
          <form className="workspace-form compact-form" onSubmit={submitItem}>
            <label>
              Nome
              <input
                value={newItem.name}
                onChange={(event) =>
                  setNewItem((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Gin seco"
              />
            </label>
            <div className="workspace-form-grid">
              <label>
                Unidade
                <select
                  value={newItem.unit}
                  onChange={(event) =>
                    setNewItem((current) => ({ ...current, unit: event.target.value }))
                  }
                >
                  <option value="un">Unidade</option>
                  <option value="ml">Mililitro</option>
                  <option value="g">Grama</option>
                  <option value="kg">Quilo</option>
                </select>
              </label>
              <label>
                Estoque mínimo
                <input
                  inputMode="decimal"
                  value={newItem.minQuantity}
                  onChange={(event) =>
                    setNewItem((current) => ({ ...current, minQuantity: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              Custo médio inicial
              <input
                inputMode="decimal"
                value={newItem.averageCost}
                onChange={(event) =>
                  setNewItem((current) => ({ ...current, averageCost: event.target.value }))
                }
                placeholder="0,00"
              />
            </label>
            <button className="button secondary" disabled={busy} type="submit">
              <PackagePlus size={16} /> Cadastrar insumo
            </button>
          </form>
        </article>
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <ClipboardCheck size={15} /> Movimento
              </span>
              <h2>Entrada, perda ou inventário</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submitMovement}>
            <label>
              Tipo
              <select
                value={movement.type}
                onChange={(event) =>
                  setMovement((current) => ({
                    ...current,
                    type: event.target.value as InventoryMovement["type"],
                  }))
                }
              >
                <option value="purchase_receipt">Entrada de compra</option>
                <option value="loss">Perda / quebra</option>
                <option value="inventory_count">Contagem de inventário</option>
                <option value="manual_adjustment">Ajuste manual</option>
              </select>
            </label>
            <label>
              Insumo
              <select
                value={movement.inventoryItemId}
                onChange={(event) =>
                  setMovement((current) => ({ ...current, inventoryItemId: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantity} {item.unit})
                  </option>
                ))}
              </select>
            </label>
            <div className="workspace-form-grid">
              <label>
                {movement.type === "inventory_count" ? "Quantidade contada" : "Quantidade"}
                <input
                  inputMode="decimal"
                  value={movement.quantity}
                  onChange={(event) =>
                    setMovement((current) => ({ ...current, quantity: event.target.value }))
                  }
                />
              </label>
              <label>
                Custo unitário
                <input
                  inputMode="decimal"
                  value={movement.unitCost}
                  onChange={(event) =>
                    setMovement((current) => ({ ...current, unitCost: event.target.value }))
                  }
                  placeholder="Opcional"
                />
              </label>
            </div>
            <label>
              Justificativa
              <input
                value={movement.reason}
                onChange={(event) =>
                  setMovement((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="Ex.: Nota de compra 1234"
              />
            </label>
            <button className="button primary" disabled={busy} type="submit">
              <ClipboardCheck size={16} /> Registrar movimento
            </button>
          </form>
        </article>
      </section>
      <section className="workspace-list-section">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Posição atual</span>
            <h2>Saldo por insumo</h2>
          </div>
        </div>
        <div className="inventory-table">
          {items.map((item) => (
            <div className="inventory-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  Mínimo: {item.minQuantity} {item.unit} · Custo:{" "}
                  {formatMoney(item.averageCostCents)}
                </small>
              </div>
              <strong
                className={Number(item.quantity) < Number(item.minQuantity) ? "stock-low" : ""}
              >
                {item.quantity} {item.unit}
              </strong>
            </div>
          ))}
          {!items.length ? <p className="muted-copy">Ainda não há insumos cadastrados.</p> : null}
        </div>
      </section>
      <section className="inventory-bottom">
        <article className="workspace-list-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <TriangleAlert size={15} /> Atenção
              </span>
              <h2>Alertas de reposição</h2>
            </div>
          </div>
          {alerts.length ? (
            alerts.map((item) => (
              <div className="inventory-row" key={item.id}>
                <span>{item.name}</span>
                <strong className="stock-low">
                  Faltam {item.shortage} {item.unit}
                </strong>
              </div>
            ))
          ) : (
            <p className="muted-copy">Nenhum alerta ativo.</p>
          )}
        </article>
        <article className="workspace-list-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Auditoria</span>
              <h2>Últimos movimentos</h2>
            </div>
          </div>
          {movements.slice(0, 8).map((item) => (
            <div className="inventory-row" key={item.id}>
              <div>
                <strong>{item.inventoryItemName}</strong>
                <small>
                  {movementLabels[item.type]} · {item.reason || "Sem justificativa"}
                </small>
              </div>
              <strong className={Number(item.quantity) < 0 ? "stock-low" : ""}>
                {Number(item.quantity) > 0 ? "+" : ""}
                {item.quantity}
              </strong>
            </div>
          ))}
          {!movements.length ? <p className="muted-copy">Nenhum movimento registrado.</p> : null}
        </article>
      </section>
    </main>
  );
}
