import { Activity, Building2, CreditCard, Flag, LifeBuoy, ShieldCheck } from "lucide-react";

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

const tenants = [
  ["Bar Aurora", "active", "Professional", "R$ 42.180"],
  ["Pizzaria Vila", "trial", "Starter", "R$ 9.740"],
  ["Pub Estacao", "past_due", "Premium", "R$ 31.220"],
] as const;

export default function PlatformPage() {
  return (
    <main className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>Platform</span>
        </a>
        <nav>
          <a className="active" href="/platform">
            <Building2 size={18} /> Tenants
          </a>
          <a href="/platform">
            <CreditCard size={18} /> Assinaturas
          </a>
          <a href="/platform">
            <Flag size={18} /> Feature flags
          </a>
          <a href="/platform">
            <Activity size={18} /> Incidentes
          </a>
          <a href="/platform">
            <LifeBuoy size={18} /> Suporte
          </a>
          <a href="/platform">
            <ShieldCheck size={18} /> Auditoria
          </a>
        </nav>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <h1>Backoffice SaaS</h1>
            <p>MRR, tenants, inadimplencia, uso e falhas de integracao.</p>
          </div>
          <button className="button primary" type="button">
            Novo tenant
          </button>
        </header>
        <section className="metrics">
          <div className="metric">
            <span>MRR</span>
            <strong>R$ 38.420</strong>
          </div>
          <div className="metric">
            <span>Tenants ativos</span>
            <strong>126</strong>
          </div>
          <div className="metric">
            <span>Churn mensal</span>
            <strong>2,1%</strong>
          </div>
          <div className="metric">
            <span>Falhas integracao</span>
            <strong>7</strong>
          </div>
        </section>
        <section className="panel" style={{ marginTop: 18 }}>
          <h2>Tenants recentes</h2>
          <div className="status-list">
            {tenants.map(([name, status, plan, volume]) => (
              <div className="status-row" key={name}>
                <strong>{name}</strong>
                <span>
                  {plan} - {volume} processados
                </span>
                <Badge
                  tone={status === "past_due" ? "danger" : status === "trial" ? "warn" : "good"}
                >
                  {status}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
