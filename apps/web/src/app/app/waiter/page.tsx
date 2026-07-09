"use client";

import {
  AlertTriangle,
  Bell,
  ChefHat,
  ClipboardList,
  Clock3,
  CreditCard,
  CupSoda,
  LogIn,
  MonitorSmartphone,
  Plus,
  Search,
  Send,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addOrderItem,
  type DiningTable,
  formatMoney,
  getSession,
  getTenantBranding,
  listProducts,
  listTables,
  type OpenOrderResponse,
  openOrder,
  type OrderItemResponse,
  type Product,
  registerManualPayment,
  sendOrderToKitchen,
  type TenantBranding,
  type TenantSession,
} from "../../../lib/giromesa-api";

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
    name: "Balcao 01",
    seats: 1,
    status: "waiting_payment",
  },
];

const demoProducts: Product[] = [
  {
    id: "demo-burger",
    name: "Burger Aurora",
    description: "Pao brioche, blend da casa e queijo.",
    categoryId: null,
    priceCents: 4290,
    costCents: 1800,
    isAvailable: true,
    channels: ["pos"],
  },
  {
    id: "demo-chopp",
    name: "Chopp Pilsen 500ml",
    description: "Tiragem rapida para salao.",
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
  displayName: "Bar Aurora",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};

type Status = "loading" | "ready" | "demo" | "error";
type TableFilter = "all" | "free" | "occupied" | "waiting_payment";
type ProductFilter = "all" | "kitchen" | "drinks" | "dessert";
type ServiceMode = "table" | "counter";
type ActionLog = {
  id: string;
  title: string;
  detail: string;
  tone: "neutral" | "good" | "warn";
  createdAt: string;
};

const notePresets = [
  "Cliente com pressa",
  "Aniversariante",
  "Sem gelo",
  "Alergia alimentar",
  "Priorizar bebidas",
] as const;

export default function WaiterPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<TenantSession | null>(null);
  const [tables, setTables] = useState<DiningTable[]>(demoTables);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [branding, setBranding] = useState<TenantBranding>(fallbackBranding);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("table");
  const [selectedTableId, setSelectedTableId] = useState(demoTables[0]?.id ?? "");
  const [tableFilter, setTableFilter] = useState<TableFilter>("all");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [productQuery, setProductQuery] = useState("");
  const [peopleCount, setPeopleCount] = useState(2);
  const [serviceNote, setServiceNote] = useState("");
  const [order, setOrder] = useState<OpenOrderResponse | null>(null);
  const [items, setItems] = useState<OrderItemResponse[]>([]);
  const [actionLog, setActionLog] = useState<ActionLog[]>([
    {
      id: "boot",
      title: "Painel do garcom pronto",
      detail: "Fluxo preparado para abrir mesa, lancar itens, disparar KDS e receber.",
      tone: "neutral",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [message, setMessage] = useState("Demo pronta para operar mesa, balcao e envio KDS.");

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const itemsTotalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.totalCents, 0),
    [items],
  );
  const totalCents = itemsTotalCents > 0 ? itemsTotalCents : (order?.totalCents ?? 0);
  const tableCounters = useMemo(
    () => ({
      free: tables.filter((table) => table.status === "free").length,
      occupied: tables.filter(
        (table) => table.status !== "free" && table.status !== "waiting_payment",
      ).length,
      waitingPayment: tables.filter((table) => table.status === "waiting_payment").length,
    }),
    [tables],
  );
  const filteredTables = useMemo(
    () =>
      tables.filter((table) => {
        if (tableFilter === "all") {
          return true;
        }
        if (tableFilter === "occupied") {
          return table.status !== "free" && table.status !== "waiting_payment";
        }
        return table.status === tableFilter;
      }),
    [tableFilter, tables],
  );
  const filteredProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${product.name} ${product.description ?? ""}`.toLowerCase().includes(normalizedQuery);
      const matchesFilter = productFilter === "all" ? true : productKind(product) === productFilter;
      return matchesQuery && matchesFilter;
    });
  }, [productFilter, productQuery, products]);
  const serviceMetrics = useMemo(
    () => ({
      kitchen: items.filter((item) => productKindFromName(item.nameSnapshot) === "kitchen").length,
      drinks: items.filter((item) => productKindFromName(item.nameSnapshot) === "drinks").length,
      dessert: items.filter((item) => productKindFromName(item.nameSnapshot) === "dessert").length,
    }),
    [items],
  );
  const nextAction = useMemo(() => {
    if (!order) {
      return {
        title: serviceMode === "counter" ? "Abrir venda de balcao" : "Abrir a mesa selecionada",
        detail:
          serviceMode === "counter"
            ? "Use esse modo para consumo rapido sem depender do mapa de mesas."
            : "Garanta pessoas e observacao antes do primeiro item.",
        tone: "warn" as const,
      };
    }
    if (items.length === 0) {
      return {
        title: "Lancar primeiros itens",
        detail: "Monte a comanda antes de disparar a cozinha ou cobrar.",
        tone: "warn" as const,
      };
    }
    if (order.status === "opened") {
      return {
        title: "Enviar para preparo",
        detail: "Os itens ja podem seguir para cozinha e bar com historico auditavel.",
        tone: "neutral" as const,
      };
    }
    if (order.status === "sent_to_kitchen") {
      return {
        title: "Acompanhar consumo e preparar fechamento",
        detail: "O pedido saiu do salao. Priorize mesa pedindo pre-conta ou balcao pronto para receber.",
        tone: "good" as const,
      };
    }
    if (order.status === "paid") {
      return {
        title: "Conta recebida",
        detail: "Fechamento registrado. Siga para a proxima mesa critica do turno.",
        tone: "good" as const,
      };
    }
    return {
      title: "Monitorar conta",
      detail: "Mantenha o salao girando com foco em preparo, entrega e fechamento.",
      tone: "neutral" as const,
    };
  }, [items.length, order, serviceMode]);
  const branchId = session?.branchId;
  const brandInitial = branding.displayName.slice(0, 1).toUpperCase() || "G";

  const load = useCallback(async () => {
    try {
      setStatus("loading");
      const activeSession = await getSession();
      setSession(activeSession);
      if (!activeSession.branchId) {
        setStatus("demo");
        setMessage("Sessao sem filial ativa. Exibindo modo demonstracao.");
        return;
      }

      const [tableList, productList, tenantBranding] = await Promise.all([
        listTables(activeSession.branchId),
        listProducts(),
        getTenantBranding(),
      ]);
      setTables(tableList.length ? tableList : demoTables);
      setProducts(productList.filter((product) => product.isAvailable).slice(0, 12));
      setBranding(tenantBranding);
      setSelectedTableId(tableList[0]?.id ?? demoTables[0]?.id ?? "");
      setStatus("ready");
      setMessage("Modo garcom conectado ao demo do Bar Aurora.");
    } catch {
      setStatus("demo");
      setMessage("Entre no demo para operar com dados reais. Esta tela segue navegavel offline.");
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
      setMessage(error instanceof Error ? error.message : "Nao foi possivel concluir a acao.");
    } finally {
      setBusyLabel(null);
    }
  }

  function pushActionLog(entry: Omit<ActionLog, "id" | "createdAt">) {
    setActionLog((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        ...entry,
      },
      ...current,
    ]);
  }

  function handleOpenOrder() {
    void run("Abrindo mesa", async () => {
      if (!branchId || (serviceMode === "table" && !selectedTable)) {
        setMessage("Entre no demo para abrir uma mesa real.");
        return;
      }
      const activeTable = selectedTable;
      const opened = await openOrder(
        branchId,
        serviceMode === "table" ? activeTable?.id : undefined,
        peopleCount,
      );
      setOrder(opened);
      setItems([]);
      pushActionLog({
        title: serviceMode === "counter" ? "Venda de balcao aberta" : `Conta aberta em ${activeTable?.code ?? "mesa"}`,
        detail:
          serviceMode === "counter"
            ? `${peopleCount} atendimento(s) iniciados no balcao.`
            : `${peopleCount} pessoa(s) vinculadas com observacao operacional pronta.`,
        tone: "good",
      });
      setMessage(
        serviceMode === "counter"
          ? `Balcao aberto para ${peopleCount} atendimento(s) com seguranca e auditoria.`
          : `${activeTable?.code ?? "Mesa"} aberta para ${peopleCount} pessoa(s) com seguranca e auditoria.`,
      );
    });
  }

  function handleAddItem(product: Product) {
    void run("Lancando item", async () => {
      if (!order) {
        setMessage("Abra a mesa antes de lancar itens.");
        return;
      }
      const item = await addOrderItem(order.id, product.id);
      setItems((current) => [...current, item]);
      pushActionLog({
        title: `${product.name} lancado`,
        detail: `${formatMoney(product.priceCents)} incluido na comanda atual.`,
        tone: "neutral",
      });
      setMessage(
        `${product.name} lancado na conta.${serviceNote.trim() ? ` Observacao ativa: ${serviceNote.trim()}.` : ""}`,
      );
    });
  }

  function handleSendKitchen() {
    void run("Enviando KDS", async () => {
      if (!order) {
        setMessage("Abra a mesa e lance itens antes de enviar para cozinha.");
        return;
      }
      const result = await sendOrderToKitchen(order.id);
      setOrder((current) => (current ? { ...current, status: result.status } : current));
      pushActionLog({
        title: "Pedido enviado ao preparo",
        detail: `${result.ticketsCreated.length || 1} ticket(s) encaminhados para cozinha/bar.`,
        tone: "good",
      });
      setMessage(`${result.ticketsCreated.length || 1} ticket enviado para preparo.`);
    });
  }

  function handlePayment() {
    void run("Recebendo", async () => {
      if (!order) {
        setMessage("Abra uma conta antes de registrar recebimento.");
        return;
      }
      const amount = Math.max(totalCents || order.totalCents, 100);
      await registerManualPayment(order.id, amount);
      setOrder((current) =>
        current ? { ...current, status: "paid", totalCents: amount } : current,
      );
      pushActionLog({
        title: "Pagamento registrado",
        detail: `Recebimento manual de ${formatMoney(amount)} enviado ao caixa.`,
        tone: "good",
      });
      setMessage("Pagamento manual registrado no caixa.");
    });
  }

  return (
    <main
      className="waiter-page"
      data-theme={branding.themeMode}
      data-accent={branding.accentPreset}
    >
      <header className="waiter-topbar">
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
            {status === "ready" ? "online" : "demo"}
          </span>
          <a className="button secondary compact" href="/login">
            <LogIn size={16} /> Entrar
          </a>
        </div>
      </header>

      <section className="waiter-hero">
        <div>
          <span className="section-kicker">
            <Sparkles size={16} /> Atendimento rapido
          </span>
          <h1>Modo garcom</h1>
          <p>{message}</p>
        </div>
        <div className="waiter-shift-card">
          <span>{serviceMode === "counter" ? "Atendimento balcao" : "Turno jantar"}</span>
          <strong>{serviceMode === "counter" ? "Balcao" : (selectedTable?.code ?? "Mesa")}</strong>
          <small>{order ? `Conta ${order.status}` : "Sem conta aberta"}</small>
        </div>
      </section>

      <section className="metrics compact">
        <article className="metric">
          <span>Mesas livres</span>
          <strong>{tableCounters.free}</strong>
          <small>Prontas para giro rapido</small>
        </article>
        <article className="metric">
          <span>Em atendimento</span>
          <strong>{tableCounters.occupied}</strong>
          <small>Mesas com consumo ou preparo</small>
        </article>
        <article className="metric">
          <span>Pagamento</span>
          <strong>{tableCounters.waitingPayment}</strong>
          <small>Prioridade de fechamento</small>
        </article>
        <article className="metric">
          <span>Conta atual</span>
          <strong>{formatMoney(totalCents)}</strong>
          <small>{items.length} item(ns) na comanda</small>
        </article>
      </section>

      <section className="waiter-quick-actions" aria-label="Atalhos do garcom">
        <a href="/app">
          <ClipboardList size={18} />
          <span>Mapa do salao</span>
        </a>
        <a href={`/q/${selectedTable?.code ?? "M03"}`}>
          <Bell size={18} />
          <span>Ver QR da mesa</span>
        </a>
        <a href="/app/reports">
          <CreditCard size={18} />
          <span>Resumo caixa</span>
        </a>
        <a href="/manual">
          <MonitorSmartphone size={18} />
          <span>Treino rapido</span>
        </a>
      </section>

      <section className="waiter-shell">
        <div className="waiter-column">
          <div className="waiter-section-title">
            <Users size={18} />
            <strong>Mesas</strong>
          </div>
          <div className="waiter-mode-switch" role="tablist" aria-label="Modo de atendimento">
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
              <CupSoda size={16} /> Balcao
            </button>
          </div>
          <div className="platform-toolbar">
            <label className="platform-search">
              Filtro
              <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value as TableFilter)}>
                <option value="all">Todas</option>
                <option value="free">Livres</option>
                <option value="occupied">Em atendimento</option>
                <option value="waiting_payment">Pagamento</option>
              </select>
            </label>
            <label className="platform-search">
              Pessoas
              <input
                inputMode="numeric"
                value={String(peopleCount)}
                onChange={(event) => setPeopleCount(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
          </div>
          {serviceMode === "table" ? (
            <div className="waiter-table-grid">
              {filteredTables.map((table) => (
                <button
                  className={`waiter-table-card ${table.id === selectedTableId ? "selected" : ""}`}
                  type="button"
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                >
                  <strong>{table.code}</strong>
                  <span>{table.name}</span>
                  <small>
                    {table.seats} lugares - {table.status}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <div className="waiter-counter-card">
              <strong>Balcao rapido</strong>
              <span>Use para pedidos sem mesa, retirada e atendimento direto no caixa.</span>
              <small>O fluxo segue auditado e pode receber pagamento logo apos o preparo.</small>
            </div>
          )}
          <div className="waiter-note-presets">
            {notePresets.map((preset) => (
              <button
                className="button ghost compact"
                type="button"
                key={preset}
                onClick={() => setServiceNote(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <label className="platform-search">
            Observacao da mesa
            <input
              value={serviceNote}
              onChange={(event) => setServiceNote(event.target.value)}
              placeholder="alergia, aniversariante, prioridade..."
            />
          </label>
          <button
            className="button primary full"
            type="button"
            onClick={handleOpenOrder}
            disabled={Boolean(busyLabel)}
            data-testid="waiter-open-table"
          >
            <ClipboardList size={18} /> {busyLabel === "Abrindo mesa" ? "Abrindo..." : "Abrir mesa"}
          </button>
        </div>

        <div className="waiter-column">
          <div className="waiter-section-title">
            <ChefHat size={18} />
            <strong>Itens rapidos</strong>
          </div>
          <div className="waiter-service-insights">
            <div>
              <span>Cozinha</span>
              <strong>{serviceMetrics.kitchen}</strong>
            </div>
            <div>
              <span>Bebidas</span>
              <strong>{serviceMetrics.drinks}</strong>
            </div>
            <div>
              <span>Sobremesas</span>
              <strong>{serviceMetrics.dessert}</strong>
            </div>
          </div>
          <div className="platform-toolbar">
            <label className="platform-search">
              Busca
              <div className="platform-search-input">
                <Search size={16} />
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="Buscar item rapido"
                />
              </div>
            </label>
            <label className="platform-search">
              Tipo
              <select
                value={productFilter}
                onChange={(event) => setProductFilter(event.target.value as ProductFilter)}
              >
                <option value="all">Todos</option>
                <option value="kitchen">Cozinha</option>
                <option value="drinks">Bebidas</option>
                <option value="dessert">Sobremesa</option>
              </select>
            </label>
          </div>
          <div className="waiter-product-list">
            {filteredProducts.slice(0, 8).map((product) => (
              <button
                className="waiter-product-row"
                type="button"
                key={product.id}
                onClick={() => handleAddItem(product)}
                disabled={!order || Boolean(busyLabel)}
                data-testid="waiter-add-item"
              >
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.description ?? "Item de venda rapida"}</small>
                </span>
                <b>{formatMoney(product.priceCents)}</b>
                <Plus size={18} />
              </button>
            ))}
          </div>
        </div>

        <aside className="waiter-ticket">
          <div className="waiter-ticket-head">
            <span>Conta atual</span>
            <strong>{formatMoney(totalCents)}</strong>
          </div>
          <div className="status-row rich">
            <div>
              <strong>{serviceMode === "counter" ? "Balcao" : (selectedTable?.code ?? "Mesa")}</strong>
              <span>
                {peopleCount} pessoa(s) · {serviceNote.trim() || "sem observacao operacional"}
              </span>
            </div>
            <Clock3 size={16} />
          </div>
          <div className="waiter-guidance-card">
            <div>
              <strong>{nextAction.title}</strong>
              <span>{nextAction.detail}</span>
            </div>
            <span className={`gm-badge gm-badge-${nextAction.tone === "good" ? "good" : nextAction.tone === "warn" ? "warn" : "info"}`}>
              proximo
            </span>
          </div>
          <div className="waiter-ticket-lines">
            {items.length ? (
              items.map((item) => (
                <div className="waiter-ticket-line" key={item.id}>
                  <span>{item.nameSnapshot}</span>
                  <strong>{formatMoney(item.totalCents)}</strong>
                </div>
              ))
            ) : (
              <p>Abra a mesa e toque nos itens para montar a comanda.</p>
            )}
          </div>
          <div className="waiter-action-bar">
            <button
              className="button secondary"
              type="button"
              onClick={handleSendKitchen}
              disabled={!order || Boolean(busyLabel)}
              data-testid="waiter-send-kds"
            >
              <Send size={17} /> Cozinha
            </button>
            <button
              className="button primary"
              type="button"
              onClick={handlePayment}
              disabled={!order || Boolean(busyLabel)}
              data-testid="waiter-pay"
            >
              <CreditCard size={17} /> Receber
            </button>
          </div>
          <div className="waiter-note">
            <Bell size={16} />
            <span>Acoes sensiveis continuam auditadas no backend.</span>
          </div>
          <div className="waiter-activity-feed">
            <div className="waiter-section-title">
              <Sparkles size={16} />
              <strong>Ultimas acoes</strong>
            </div>
            {actionLog.slice(0, 5).map((entry) => (
              <div className="waiter-activity-item" key={entry.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <span>{entry.detail}</span>
                </div>
                <small>{new Date(entry.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>
              </div>
            ))}
          </div>
          {order?.status === "paid" ? (
            <div className="waiter-note danger">
              <AlertTriangle size={16} />
              <span>Conta recebida. O ideal agora e liberar mesa ou partir para nova rodada.</span>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
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

function productKindFromName(name: string): ProductFilter {
  return productKind({
    id: name,
    name,
    description: "",
    categoryId: null,
    priceCents: 0,
    costCents: 0,
    isAvailable: true,
    channels: ["pos"],
  });
}
