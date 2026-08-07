"use client";

import {
  ArrowRightLeft,
  Boxes,
  ClipboardCheck,
  PackagePlus,
  Recycle,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { appendTransferLine } from "../../../features/inventory/transfer-lines";
import {
  adjustInventoryStock,
  cancelInventoryTransfer,
  createInventoryItem,
  createInventoryTransfer,
  formatMoney,
  getSession,
  type InventoryAlert,
  type InventoryLocationBalance,
  type InventoryMovement,
  type InventorySummaryItem,
  type InventoryTransfer,
  listInventoryAlerts,
  listInventoryLocationBalances,
  listInventoryMovements,
  listInventorySummary,
  listInventoryTransfers,
  listProducts,
  listReturnableMappings,
  listStockLocations,
  listSuppliers,
  type Product,
  type ReturnableMapping,
  receiveInventoryTransfer,
  recordReturnableEvent,
  reverseInventoryTransfer,
  type StockLocation,
  type Supplier,
  upsertReturnableMapping,
} from "../../../lib/giromesa-api";

const movementLabels: Record<InventoryMovement["type"], string> = {
  purchase_receipt: "Entrada",
  loss: "Perda",
  inventory_count: "Inventário",
  manual_adjustment: "Ajuste",
  sale: "Venda / consumo",
  transfer_dispatch: "Saída de transferência",
  transfer_receipt: "Recebimento de transferência",
  transfer_divergence: "Divergência de transferência",
  transfer_reversal: "Estorno de transferência",
  returnable_consumption: "Movimento de vasilhame",
  returnable_supplier_exchange: "Troca com fornecedor",
  returnable_breakage: "Quebra de vasilhame",
  returnable_loss: "Extravio de vasilhame",
};

export default function InventoryPage() {
  const [branchId, setBranchId] = useState("");
  const [items, setItems] = useState<InventorySummaryItem[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationBalances, setLocationBalances] = useState<InventoryLocationBalance[]>([]);
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [returnableMappings, setReturnableMappings] = useState<ReturnableMapping[]>([]);
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
    stockLocationId: "",
    supplierId: "",
  });
  const [transfer, setTransfer] = useState({
    originLocationId: "",
    destinationLocationId: "",
    inventoryItemId: "",
    quantity: "",
    reason: "",
    lines: [] as Array<{ inventoryItemId: string; quantity: string }>,
  });
  const [transferStep, setTransferStep] = useState(1);
  const [returnable, setReturnable] = useState({
    mappingId: "",
    productId: "",
    fullInventoryItemId: "",
    emptyInventoryItemId: "",
    stockLocationId: "",
    supplierId: "",
    type: "supplier_exchange" as "supplier_exchange" | "breakage" | "loss",
    quantity: "",
    reason: "",
  });

  async function refresh(activeBranchId = branchId) {
    if (!activeBranchId) return;
    try {
      const [
        summary,
        alertRows,
        movementRows,
        locationRows,
        transferRows,
        supplierRows,
        productRows,
        mappingRows,
        balanceRows,
      ] = await Promise.all([
        listInventorySummary(activeBranchId),
        listInventoryAlerts(activeBranchId),
        listInventoryMovements(activeBranchId),
        listStockLocations(activeBranchId),
        listInventoryTransfers(activeBranchId),
        listSuppliers(),
        listProducts(),
        listReturnableMappings(),
        listInventoryLocationBalances(activeBranchId),
      ]);
      setItems(summary);
      setAlerts(alertRows);
      setMovements(movementRows);
      setLocations(locationRows);
      setTransfers(transferRows);
      setSuppliers(supplierRows);
      setProducts(productRows);
      setReturnableMappings(mappingRows);
      setLocationBalances(balanceRows);
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
  const selectedLocationBalance = locationBalances.find(
    (entry) =>
      entry.locationId === movement.stockLocationId &&
      entry.inventoryItemId === movement.inventoryItemId,
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
      !movement.stockLocationId ||
      !movement.quantity ||
      (movement.type === "purchase_receipt" && !movement.supplierId) ||
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
        stockLocationId: movement.stockLocationId,
        ...(movement.supplierId ? { supplierId: movement.supplierId } : {}),
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
        stockLocationId: "",
        supplierId: "",
      });
      await refresh();
      setMessage("Movimento registrado e auditado no estoque.");
    } catch {
      setMessage("Não foi possível registrar o movimento. Confira o saldo e as permissões.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !branchId ||
      !transfer.originLocationId ||
      !transfer.destinationLocationId ||
      transfer.lines.length === 0 ||
      transfer.reason.trim().length < 5
    ) {
      setMessage("Complete origem, destino, item, quantidade e motivo da transferência.");
      return;
    }
    setBusy(true);
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}`;
      const result = await createInventoryTransfer({
        branchId,
        originLocationId: transfer.originLocationId,
        destinationLocationId: transfer.destinationLocationId,
        reason: transfer.reason.trim(),
        idempotencyKey,
        lines: transfer.lines,
      });
      setTransfer({
        originLocationId: "",
        destinationLocationId: "",
        inventoryItemId: "",
        quantity: "",
        reason: "",
        lines: [],
      });
      setTransferStep(1);
      await refresh();
      setMessage(
        result.status === "awaiting_receipt"
          ? "Transferência enviada. Aguarda conferência do setor de destino."
          : "Transferência concluída e auditada.",
      );
    } catch {
      setMessage(
        "Não foi possível transferir. Confira saldo no setor, permissões e dados informados.",
      );
    } finally {
      setBusy(false);
    }
  }

  function addTransferLine() {
    try {
      const lines = appendTransferLine(transfer.lines, {
        inventoryItemId: transfer.inventoryItemId,
        quantity: transfer.quantity,
      });
      setTransfer((current) => ({
        ...current,
        inventoryItemId: "",
        quantity: "",
        lines,
      }));
      setMessage(`${lines.length} item(ns) incluído(s) na transferência.`);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "duplicate-transfer-line"
          ? "Este item já está na transferência. Remova a linha para substituí-la."
          : "Selecione um item e informe uma quantidade maior que zero.",
      );
    }
  }

  function removeTransferLine(inventoryItemId: string) {
    setTransfer((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.inventoryItemId !== inventoryItemId),
    }));
  }

  async function receiveTransfer(transferRow: InventoryTransfer) {
    try {
      const lines = transferRow.lines.map((line) => {
        const quantityReceived = window.prompt("Quantidade recebida", line.quantitySent);
        if (quantityReceived === null) throw new Error("cancelled");
        const differs = Number(quantityReceived) !== Number(line.quantitySent);
        const divergenceReason = differs
          ? window.prompt("Motivo da divergência")?.trim()
          : undefined;
        if (differs && !divergenceReason) throw new Error("divergence-reason");
        return { id: line.id, quantityReceived, ...(divergenceReason ? { divergenceReason } : {}) };
      });
      setBusy(true);
      await receiveInventoryTransfer(transferRow.id, {
        expectedVersion: transferRow.version,
        lines,
      });
      await refresh();
      setMessage("Transferência recebida e conferida.");
    } catch {
      setMessage("Não foi possível receber. Revise quantidades e justifique divergências.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelTransfer(transferRow: InventoryTransfer) {
    setBusy(true);
    try {
      await cancelInventoryTransfer(transferRow.id, transferRow.version);
      await refresh();
      setMessage("Rascunho cancelado.");
    } catch {
      setMessage("Não foi possível cancelar; a transferência pode ter sido alterada.");
    } finally {
      setBusy(false);
    }
  }

  async function reverseTransfer(transferRow: InventoryTransfer) {
    const reason = window.prompt("Motivo do estorno")?.trim();
    if (!reason || reason.length < 5) return;
    setBusy(true);
    try {
      await reverseInventoryTransfer(transferRow.id, transferRow.version, reason);
      await refresh();
      setMessage("Transferência estornada e auditada.");
    } catch {
      setMessage("Não foi possível estornar; confira saldo e versão.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReturnableMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !returnable.productId ||
      !returnable.fullInventoryItemId ||
      !returnable.emptyInventoryItemId
    )
      return;
    setBusy(true);
    try {
      await upsertReturnableMapping(returnable);
      await refresh();
      setMessage("Mapeamento de cheio e vazio salvo.");
    } catch {
      setMessage("Não foi possível salvar. O item cheio não pode ser baixado também pela receita.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReturnableEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !branchId ||
      !returnable.stockLocationId ||
      !returnable.mappingId ||
      !returnable.quantity ||
      returnable.reason.trim().length < 5
    )
      return;
    setBusy(true);
    try {
      await recordReturnableEvent({
        branchId,
        stockLocationId: returnable.stockLocationId,
        mappingId: returnable.mappingId,
        type: returnable.type,
        quantity: returnable.quantity,
        reason: returnable.reason.trim(),
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `returnable-${Date.now()}`,
        ...(returnable.supplierId ? { supplierId: returnable.supplierId } : {}),
      });
      await refresh();
      setMessage("Movimento de vasilhame registrado e auditado.");
    } catch {
      setMessage("Não foi possível registrar. Confira saldo, fornecedor e setor.");
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
        <a className="button secondary" href="/app/settings/branch-structure">
          Estrutura da filial
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Boxes size={16} /> Estoque
        </span>
        <h1>Controle de insumos</h1>
        <p aria-live="polite" role="status">
          {message}
        </p>
      </section>
      <section className="inventory-metrics" aria-label="Ações prioritárias do estoque">
        <a className="workspace-panel" href="#transferir">
          <ArrowRightLeft size={18} />
          <strong>Transferir produtos</strong>
          <small>Envie entre setores com rastreabilidade.</small>
        </a>
        <a className="workspace-panel" href="#receber">
          <Truck size={18} />
          <strong>Receber fornecedor</strong>
          <small>Registre entrada e conferência.</small>
        </a>
        <a className="workspace-panel" href="#conferir">
          <ClipboardCheck size={18} />
          <strong>Conferir um setor</strong>
          <small>Compare contado e sistema.</small>
        </a>
        <a className="workspace-panel" href="#vasilhames">
          <Recycle size={18} />
          <strong>Embalagens retornáveis</strong>
          <small>Controle apenas vasilhames de bebidas retornáveis.</small>
        </a>
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
        <article className="workspace-panel" id="transferir">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <ArrowRightLeft size={15} /> Transferência
              </span>
              <h2>Transferir produtos</h2>
            </div>
          </div>
          <p className="muted-copy">
            Passo {transferStep} de 4:{" "}
            {
              [
                "Escolha os setores",
                "Selecione o produto",
                "Informe o motivo",
                "Revise e confirme",
              ][transferStep - 1]
            }
            .
          </p>
          <form className="workspace-form compact-form" onSubmit={submitTransfer}>
            {transferStep === 1 ? (
              <>
                <div className="workspace-form-grid">
                  <label>
                    Origem
                    <select
                      value={transfer.originLocationId}
                      onChange={(event) =>
                        setTransfer((current) => ({
                          ...current,
                          originLocationId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {locations
                        .filter((location) => location.type !== "transit")
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Destino
                    <select
                      value={transfer.destinationLocationId}
                      onChange={(event) =>
                        setTransfer((current) => ({
                          ...current,
                          destinationLocationId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {locations
                        .filter(
                          (location) =>
                            location.id !== transfer.originLocationId &&
                            location.type !== "transit",
                        )
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <button
                  className="button primary"
                  disabled={!transfer.originLocationId || !transfer.destinationLocationId}
                  onClick={() => setTransferStep(2)}
                  type="button"
                >
                  Continuar
                </button>
              </>
            ) : null}
            {transferStep === 2 ? (
              <>
                <label>
                  Produto
                  <select
                    value={transfer.inventoryItemId}
                    onChange={(event) =>
                      setTransfer((current) => ({
                        ...current,
                        inventoryItemId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Selecione</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantidade
                  <input
                    inputMode="decimal"
                    value={transfer.quantity}
                    onChange={(event) =>
                      setTransfer((current) => ({ ...current, quantity: event.target.value }))
                    }
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={!transfer.inventoryItemId || !transfer.quantity}
                  onClick={addTransferLine}
                  type="button"
                >
                  Adicionar item
                </button>
                <section aria-label="Itens da transferência">
                  {transfer.lines.map((line) => (
                    <div className="inventory-row" key={line.inventoryItemId}>
                      <div>
                        <strong>
                          {items.find((item) => item.id === line.inventoryItemId)?.name ?? "Item"}
                        </strong>
                        <small>Quantidade: {line.quantity}</small>
                      </div>
                      <button
                        aria-label={`Remover ${items.find((item) => item.id === line.inventoryItemId)?.name ?? "item"}`}
                        className="button secondary"
                        onClick={() => removeTransferLine(line.inventoryItemId)}
                        type="button"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  {!transfer.lines.length ? (
                    <p className="muted-copy">Adicione ao menos um item para continuar.</p>
                  ) : null}
                </section>
                <div>
                  <button
                    className="button secondary"
                    onClick={() => setTransferStep(1)}
                    type="button"
                  >
                    Voltar
                  </button>
                  <button
                    className="button primary"
                    disabled={transfer.lines.length === 0}
                    onClick={() => setTransferStep(3)}
                    type="button"
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : null}
            {transferStep === 3 ? (
              <>
                <label>
                  Motivo
                  <input
                    value={transfer.reason}
                    onChange={(event) =>
                      setTransfer((current) => ({ ...current, reason: event.target.value }))
                    }
                    placeholder="Ex.: reposição do bar"
                  />
                </label>
                <div>
                  <button
                    className="button secondary"
                    onClick={() => setTransferStep(2)}
                    type="button"
                  >
                    Voltar
                  </button>
                  <button
                    className="button primary"
                    disabled={transfer.reason.trim().length < 5}
                    onClick={() => setTransferStep(4)}
                    type="button"
                  >
                    Revisar
                  </button>
                </div>
              </>
            ) : null}
            {transferStep === 4 ? (
              <>
                <section aria-label="Revisão dos itens da transferência">
                  {transfer.lines.map((line) => (
                    <div className="inventory-row" key={line.inventoryItemId}>
                      <div>
                        <strong>
                          {items.find((item) => item.id === line.inventoryItemId)?.name ?? "Item"}
                        </strong>
                        <small>
                          {
                            locations.find((location) => location.id === transfer.originLocationId)
                              ?.name
                          }{" "}
                          →{" "}
                          {
                            locations.find(
                              (location) => location.id === transfer.destinationLocationId,
                            )?.name
                          }
                        </small>
                      </div>
                      <strong>{line.quantity}</strong>
                    </div>
                  ))}
                </section>
                <p className="muted-copy">Motivo: {transfer.reason}</p>
                <div>
                  <button
                    className="button secondary"
                    onClick={() => setTransferStep(3)}
                    type="button"
                  >
                    Voltar
                  </button>
                  <button className="button primary" disabled={busy} type="submit">
                    <ArrowRightLeft size={16} /> Confirmar transferência
                  </button>
                </div>
              </>
            ) : null}
          </form>
        </article>
        <article className="workspace-panel" aria-label="Transferências recentes">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Acompanhamento</span>
              <h2>Envio, recebimento e reversão</h2>
            </div>
          </div>
          {transfers.slice(0, 8).map((transferRow) => (
            <div className="inventory-row" key={transferRow.id}>
              <div>
                <strong>{readTransferStatus(transferRow.status)}</strong>
                <small>{transferRow.reason}</small>
              </div>
              <span>
                {transferRow.status === "awaiting_receipt" ? (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void receiveTransfer(transferRow)}
                    type="button"
                  >
                    Receber
                  </button>
                ) : null}
                {transferRow.status === "draft" ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void cancelTransfer(transferRow)}
                    type="button"
                  >
                    Cancelar
                  </button>
                ) : null}
                {transferRow.status === "completed" && !transferRow.reversedAt ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void reverseTransfer(transferRow)}
                    type="button"
                  >
                    Estornar
                  </button>
                ) : null}
              </span>
            </div>
          ))}
          {!transfers.length ? (
            <p className="muted-copy">Nenhuma transferência registrada.</p>
          ) : null}
        </article>
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
        <article className="workspace-panel" id="receber">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <ClipboardCheck size={15} /> Movimento
              </span>
              <h2>Receber fornecedor ou conferir setor</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submitMovement}>
            <span id="conferir" />
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
              Setor
              <select
                value={movement.stockLocationId}
                onChange={(event) =>
                  setMovement((current) => ({ ...current, stockLocationId: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {locations
                  .filter((location) => location.type !== "transit")
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
            {movement.type === "purchase_receipt" ? (
              <label>
                Fornecedor
                <select
                  value={movement.supplierId}
                  onChange={(event) =>
                    setMovement((current) => ({ ...current, supplierId: event.target.value }))
                  }
                >
                  <option value="">Selecione</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
                {movement.type === "inventory_count" ? (
                  <small>
                    Sistema: {selectedLocationBalance?.quantity ?? "0"} · Diferença:{" "}
                    {movement.quantity
                      ? Number(movement.quantity) - Number(selectedLocationBalance?.quantity ?? 0)
                      : "—"}
                  </small>
                ) : null}
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
      <section
        className="workspace-list-section inventory-alerts-section"
        aria-label="Alertas gerais do estoque"
      >
        <div className="panel-heading">
          <div>
            <span className="section-kicker">
              <TriangleAlert size={15} /> Atenção necessária
            </span>
            <h2>Alertas gerais do estoque</h2>
          </div>
          <span className="gm-status-pill gm-status-pill-warn">{alerts.length} ativo(s)</span>
        </div>
        <p className="muted-copy">
          Insumos abaixo do mínimo aparecem aqui. Embalagens retornáveis são controladas
          separadamente na seção seguinte.
        </p>
        <div className="inventory-table">
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
            <p className="muted-copy">Nenhum insumo abaixo do estoque mínimo.</p>
          )}
        </div>
      </section>
      <section className="inventory-bottom">
        <article className="workspace-list-section" id="vasilhames">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <Recycle size={15} /> Retornáveis
              </span>
              <h2>Embalagens retornáveis</h2>
            </div>
          </div>
          <p className="muted-copy">
            Use somente para garrafas, engradados e outros vasilhames que retornam ao fornecedor.
            Embalagens descartáveis e alertas gerais não entram neste controle.
          </p>
          <form className="workspace-form compact-form" onSubmit={saveReturnableMapping}>
            <label>
              Produto
              <select
                value={returnable.productId}
                onChange={(event) =>
                  setReturnable((current) => ({ ...current, productId: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {products
                  .filter((product) => product.usesReturnablePackaging)
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
              </select>
              {!products.some((product) => product.usesReturnablePackaging) ? (
                <span className="muted-copy">
                  Marque o produto como “Usa vasilhame retornável” no catálogo antes de mapear.
                </span>
              ) : null}
            </label>
            <div className="workspace-form-grid">
              <label>
                Embalagem cheia
                <select
                  value={returnable.fullInventoryItemId}
                  onChange={(event) =>
                    setReturnable((current) => ({
                      ...current,
                      fullInventoryItemId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Embalagem vazia
                <select
                  value={returnable.emptyInventoryItemId}
                  onChange={(event) =>
                    setReturnable((current) => ({
                      ...current,
                      emptyInventoryItemId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="button secondary" disabled={busy} type="submit">
              Salvar mapeamento
            </button>
          </form>
          <form className="workspace-form compact-form" onSubmit={submitReturnableEvent}>
            <label>
              Produto e embalagem cadastrados
              <select
                value={returnable.mappingId}
                onChange={(event) =>
                  setReturnable((current) => ({ ...current, mappingId: event.target.value }))
                }
              >
                <option value="">Selecione um mapeamento</option>
                {returnableMappings.map((mapping) => (
                  <option key={mapping.id} value={mapping.id}>
                    {products.find((product) => product.id === mapping.productId)?.name ??
                      "Produto"}{" "}
                    ·{" "}
                    {items.find((item) => item.id === mapping.fullInventoryItemId)?.name ?? "Cheio"}
                    {" → "}
                    {items.find((item) => item.id === mapping.emptyInventoryItemId)?.name ??
                      "Vazio"}
                  </option>
                ))}
              </select>
            </label>
            <div className="workspace-form-grid">
              <label>
                Operação
                <select
                  value={returnable.type}
                  onChange={(event) =>
                    setReturnable((current) => ({
                      ...current,
                      type: event.target.value as typeof returnable.type,
                    }))
                  }
                >
                  <option value="supplier_exchange">Troca com fornecedor</option>
                  <option value="breakage">Quebra</option>
                  <option value="loss">Extravio</option>
                </select>
              </label>
              <label>
                Setor
                <select
                  value={returnable.stockLocationId}
                  onChange={(event) =>
                    setReturnable((current) => ({
                      ...current,
                      stockLocationId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {locations
                    .filter((location) => location.type !== "transit")
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {returnable.type === "supplier_exchange" ? (
              <label>
                Fornecedor
                <select
                  value={returnable.supplierId}
                  onChange={(event) =>
                    setReturnable((current) => ({ ...current, supplierId: event.target.value }))
                  }
                >
                  <option value="">Selecione</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Quantidade
              <input
                inputMode="decimal"
                value={returnable.quantity}
                onChange={(event) =>
                  setReturnable((current) => ({ ...current, quantity: event.target.value }))
                }
              />
            </label>
            <label>
              Motivo
              <input
                value={returnable.reason}
                onChange={(event) =>
                  setReturnable((current) => ({ ...current, reason: event.target.value }))
                }
              />
            </label>
            <button className="button primary" disabled={busy} type="submit">
              Registrar movimento
            </button>
          </form>
          <p className="muted-copy">
            {returnableMappings.length} produto(s) com embalagem configurada.
          </p>
          {returnableMappings.map((mapping) => {
            const product = products.find((entry) => entry.id === mapping.productId);
            const full = items.find((entry) => entry.id === mapping.fullInventoryItemId);
            const empty = items.find((entry) => entry.id === mapping.emptyInventoryItemId);
            return (
              <div className="inventory-row" key={mapping.id}>
                <div>
                  <strong>{product?.name ?? "Produto"}</strong>
                  <small>
                    Cheios: {full?.quantity ?? "0"} · Vazios disponíveis: {empty?.quantity ?? "0"}
                  </small>
                </div>
              </div>
            );
          })}
          <p className="muted-copy">
            Última troca:{" "}
            {movements.find((entry) => entry.type === "returnable_supplier_exchange")?.createdAt
              ? new Date(
                  movements.find((entry) => entry.type === "returnable_supplier_exchange")
                    ?.createdAt ?? "",
                ).toLocaleString("pt-BR")
              : "nenhuma registrada"}
          </p>
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
                  {movementLabels[item.type] ?? "Movimentação"} · {readMovementReason(item.reason)}
                </small>
              </div>
              <strong className={Number(item.quantity) < 0 ? "stock-low" : ""}>
                {Number(item.quantity) > 0 ? "+" : ""}
                {formatInventoryQuantity(
                  item.quantity,
                  items.find((inventoryItem) => inventoryItem.id === item.inventoryItemId)?.unit,
                )}
              </strong>
            </div>
          ))}
          {!movements.length ? <p className="muted-copy">Nenhum movimento registrado.</p> : null}
        </article>
      </section>
    </main>
  );
}

function readTransferStatus(status: string) {
  const labels: Record<string, string> = {
    draft: "Em preparação",
    awaiting_receipt: "Aguardando recebimento",
    completed: "Concluída",
    canceled: "Cancelada",
    reversed: "Estornada",
  };
  return labels[status] ?? "Em acompanhamento";
}

function readMovementReason(reason: string | null) {
  if (!reason) return "Sem observação";
  return reason
    .replace(/^initial balance\s*[·-]?\s*/i, "Saldo inicial · ")
    .replace(/Seed demo/gi, "Base de demonstração");
}

function formatInventoryQuantity(quantity: string, unit?: string) {
  const value = Number(quantity);
  if (!Number.isFinite(value)) return quantity;
  if (unit === "ml" && Math.abs(value) >= 1000) {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value / 1000)} L`;
  }
  const formatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}
