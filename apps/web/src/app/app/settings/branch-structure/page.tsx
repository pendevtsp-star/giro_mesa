"use client";

import { Building2, Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  archiveStockLocation,
  createStockLocation,
  getInventorySettings,
  getSession,
  listStockLocations,
  renameStockLocation,
  type StockLocation,
  saveInventorySettings,
} from "../../../../lib/giromesa-api";

const typeLabel: Record<"salon" | "production" | "stock", string> = {
  salon: "Salão",
  production: "Produção",
  stock: "Estoque",
};
const locationTypeLabel: Record<StockLocation["type"], string> = {
  ...typeLabel,
  main: "Estoque",
  transit: "Em trânsito",
};

export default function BranchStructurePage() {
  const [branchId, setBranchId] = useState("");
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [message, setMessage] = useState("Carregando estrutura da filial...");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", type: "stock" as keyof typeof typeLabel });
  const [settings, setSettings] = useState({
    transferMode: "immediate" as "immediate" | "awaiting_receipt",
    managerApprovalThreshold: "0",
    consumptionLocationId: "",
  });

  async function refresh(activeBranchId = branchId) {
    if (!activeBranchId) return;
    const [rows, inventorySettings] = await Promise.all([
      listStockLocations(activeBranchId),
      getInventorySettings(activeBranchId),
    ]);
    setLocations(rows.filter((location) => location.type !== "transit"));
    setSettings({
      transferMode: inventorySettings.transferMode,
      managerApprovalThreshold: inventorySettings.managerApprovalThreshold,
      consumptionLocationId: inventorySettings.consumptionLocationId ?? "",
    });
    setMessage("Defina os setores físicos antes de transferir produtos.");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: branch bootstrap runs only once.
  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error();
        setBranchId(session.branchId);
        await refresh(session.branchId);
      } catch {
        setMessage("Entre com uma conta de gestão de estoque para configurar a filial.");
      }
    })();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branchId || form.name.trim().length < 2) return;
    setBusy(true);
    try {
      await createStockLocation({ branchId, name: form.name.trim(), type: form.type });
      setForm({ name: "", type: "stock" });
      await refresh();
      setMessage("Setor criado.");
    } catch {
      setMessage("Não foi possível criar o setor.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(location: StockLocation) {
    const name = window.prompt("Novo nome do setor", location.name)?.trim();
    if (!name || name === location.name) return;
    setBusy(true);
    try {
      await renameStockLocation(location.id, name);
      await refresh();
      setMessage("Setor renomeado.");
    } catch {
      setMessage("Não foi possível renomear o setor.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(location: StockLocation) {
    if (
      !window.confirm(
        `Arquivar ${location.name}? O setor precisa estar sem saldo e sem transferência aberta.`,
      )
    )
      return;
    setBusy(true);
    try {
      await archiveStockLocation(location.id);
      await refresh();
      setMessage("Setor arquivado.");
    } catch {
      setMessage("Não foi possível arquivar. Zere o saldo e conclua transferências abertas.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branchId || !settings.consumptionLocationId) return;
    setBusy(true);
    try {
      await saveInventorySettings({ branchId, ...settings });
      await refresh();
      setMessage("Regras de estoque atualizadas.");
    } catch {
      setMessage("Não foi possível salvar as regras de estoque.");
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
        <a className="button secondary" href="/app/inventory">
          Voltar ao estoque
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Building2 size={16} /> Configurações
        </span>
        <h1>Estrutura da filial</h1>
        <p aria-live="polite" role="status">
          {message}
        </p>
      </section>
      <section className="catalog-layout inventory-layout">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <h2>Novo setor</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submit}>
            <label>
              Nome
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Bar principal"
              />
            </label>
            <label>
              Área
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as keyof typeof typeLabel,
                  }))
                }
              >
                {Object.entries(typeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={busy} type="submit">
              <Plus size={16} /> Criar setor
            </button>
          </form>
        </article>
        <article className="workspace-list-section">
          <div className="panel-heading">
            <div>
              <h2>Setores ativos</h2>
            </div>
          </div>
          {locations.map((location) => (
            <div className="inventory-row" key={location.id}>
              <div>
                <strong>{location.name}</strong>
                <small>{locationTypeLabel[location.type]}</small>
              </div>
              <span>
                <button
                  className="button secondary"
                  onClick={() => void rename(location)}
                  disabled={busy}
                  type="button"
                >
                  Renomear
                </button>
                <button
                  className="button secondary"
                  onClick={() => void archive(location)}
                  disabled={busy}
                  type="button"
                >
                  Arquivar
                </button>
              </span>
            </div>
          ))}
          {!locations.length ? (
            <p className="muted-copy">Crie Salão, Produção e Estoque conforme sua operação.</p>
          ) : null}
        </article>
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <h2>Regras de movimentação</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submitSettings}>
            <label>
              Modo de transferência
              <select
                value={settings.transferMode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    transferMode: event.target.value as typeof settings.transferMode,
                  }))
                }
              >
                <option value="immediate">Imediata</option>
                <option value="awaiting_receipt">Conferida no destino</option>
              </select>
            </label>
            <label>
              Setor padrão de consumo
              <select
                value={settings.consumptionLocationId}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    consumptionLocationId: event.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Divergência que exige gerente (%)
              <input
                inputMode="decimal"
                max="100"
                min="0"
                value={settings.managerApprovalThreshold}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    managerApprovalThreshold: event.target.value,
                  }))
                }
              />
            </label>
            <p className="muted-copy">
              Acima deste percentual em qualquer linha, somente gerente pode concluir o recebimento.
            </p>
            <button className="button primary" disabled={busy} type="submit">
              Salvar regras
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
