import {
  BadgeDollarSign,
  Bell,
  ChefHat,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  PackageOpen,
  QrCode,
  Settings,
  Users,
} from "lucide-react";

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

const nav = [
  [LayoutDashboard, "Dashboard"],
  [ClipboardList, "PDV"],
  [Users, "Mesas"],
  [ChefHat, "KDS"],
  [PackageOpen, "Estoque"],
  [CreditCard, "Caixa"],
  [QrCode, "Cardapio"],
  [Settings, "Config"],
] as const;

const orders = [
  ["M12", "sent_to_kitchen", "R$ 148,00"],
  ["C07", "preparing", "R$ 86,50"],
  ["Balcao 03", "waiting_payment", "R$ 42,00"],
  ["Delivery 19", "ready", "R$ 113,90"],
] as const;

const alerts = [
  ["Estoque critico", "Chopp Pilsen abaixo do minimo", "warn"],
  ["Webhook Asaas", "Fila em monitoramento", "neutral"],
  ["KDS", "2 pedidos acima de 18 minutos", "danger"],
] as const;

export default function AppDashboardPage() {
  return (
    <main className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <nav aria-label="Modulos">
          {nav.map(([Icon, label], index) => (
            <a className={index === 0 ? "active" : ""} href="/app" key={label}>
              <Icon size={18} />
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <h1>Dashboard do dia</h1>
            <p>Unidade Centro - turno almoco/jantar</p>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button">
              <Bell size={18} /> Alertas
            </button>
            <button className="button primary" type="button">
              <BadgeDollarSign size={18} /> Abrir PDV
            </button>
          </div>
        </header>

        <section className="metrics">
          <div className="metric">
            <span>Vendas hoje</span>
            <strong>R$ 8.742</strong>
          </div>
          <div className="metric">
            <span>Pedidos ativos</span>
            <strong>31</strong>
          </div>
          <div className="metric">
            <span>Mesas ocupadas</span>
            <strong>18/30</strong>
          </div>
          <div className="metric">
            <span>Caixa atual</span>
            <strong>R$ 2.184</strong>
          </div>
        </section>

        <section className="operations">
          <div className="panel">
            <h2>Pedidos em andamento</h2>
            <div className="status-list">
              {orders.map(([code, status, amount]) => (
                <div className="status-row" key={code}>
                  <strong>{code}</strong>
                  <span>{status}</span>
                  <Badge tone={status === "waiting_payment" ? "warn" : "neutral"}>{amount}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Riscos operacionais</h2>
            <div className="status-list">
              {alerts.map(([title, body, tone]) => (
                <div className="status-row" key={title}>
                  <Badge tone={tone as "neutral" | "warn" | "danger"}>{title}</Badge>
                  <span>{body}</span>
                  <span />
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
