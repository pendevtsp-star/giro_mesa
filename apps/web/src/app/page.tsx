import {
  ArrowRight,
  BarChart3,
  ChefHat,
  ClipboardList,
  CreditCard,
  QrCode,
  ShieldCheck,
  Soup,
  Warehouse,
} from "lucide-react";

const features = [
  {
    icon: ClipboardList,
    title: "PDV, mesas e comandas",
    body: "Venda no balcao, por mesa ou comanda com divisao de conta, descontos permitidos e auditoria.",
  },
  {
    icon: ChefHat,
    title: "KDS por estacao",
    body: "Cozinha, bar, chapa e expedicao acompanham pedidos em tempo real com alerta de atraso.",
  },
  {
    icon: QrCode,
    title: "Cardapio QR",
    body: "Cardapio publico por unidade, mesa e canal, pronto para pedido pelo cliente quando habilitado.",
  },
  {
    icon: Warehouse,
    title: "Estoque e ficha tecnica",
    body: "Baixa automatica por receita, CMV basico, estoque minimo e movimentos reversos em cancelamentos.",
  },
  {
    icon: CreditCard,
    title: "Caixa e pagamentos",
    body: "Formas manuais no MVP, Asaas para assinatura SaaS e arquitetura pronta para Pix online.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-tenant seguro",
    body: "Isolamento por tenant, RBAC backend, logs sanitizados e auditoria append-only.",
  },
];

const plans = [
  ["Starter", "R$ 149", "PDV, mesas, cardapio QR e relatorios basicos."],
  ["Professional", "R$ 299", "KDS, estoque, ficha tecnica, caixa avancado e automacoes."],
  ["Premium", "R$ 499", "Multi-filial, WhatsApp, dashboards e integracoes prioritarias."],
  ["Enterprise", "Sob consulta", "Limites customizados, suporte dedicado e arquitetura isolada."],
];

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <nav className="nav-links" aria-label="Navegacao principal">
          <a href="#beneficios">Beneficios</a>
          <a href="#planos">Planos</a>
          <a href="#faq">FAQ</a>
          <a href="/app">Demo</a>
        </nav>
        <div className="nav-actions">
          <a className="button ghost" href="/login">
            Login
          </a>
          <a className="button primary" href="/login">
            Comecar
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">
            <Soup size={18} /> SaaS para operacao food service
          </span>
          <h1>GiroMesa</h1>
          <p>
            Controle salao, cozinha, caixa, cardapio digital, estoque e financeiro em uma plataforma
            comercial preparada para crescer com cada estabelecimento.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="/login">
              Comecar agora <ArrowRight size={18} />
            </a>
            <a className="button secondary" href="/app">
              Ver demo operacional
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="beneficios">
        <div className="section-header">
          <h2>Operacao conectada do pedido ao caixa</h2>
          <p>
            O MVP prioriza o que faz o estabelecimento vender, produzir, receber e auditar sem
            perder controle entre salao, cozinha e gestao.
          </p>
        </div>
        <div className="grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature" key={feature.title}>
                <Icon size={24} />
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Indicadores que importam no turno</h2>
          <p>
            Dashboards densos para decisao rapida: vendas, pedidos atrasados, mesas, estoque, caixa,
            integracoes e falhas operacionais.
          </p>
        </div>
        <div className="metrics">
          <div className="metric">
            <BarChart3 size={22} />
            <span>Vendas hoje</span>
            <strong>R$ 8.742</strong>
          </div>
          <div className="metric">
            <ChefHat size={22} />
            <span>Tempo medio KDS</span>
            <strong>11 min</strong>
          </div>
          <div className="metric">
            <QrCode size={22} />
            <span>Acessos QR</span>
            <strong>126</strong>
          </div>
        </div>
      </section>

      <section className="section" id="planos">
        <div className="section-header">
          <h2>Planos comerciais iniciais</h2>
          <p>
            Valores de referencia para validacao. Precificacao final depende de suporte, fiscal e
            integracoes.
          </p>
        </div>
        <div className="grid plans">
          {plans.map(([name, price, description]) => (
            <article className="plan" key={name}>
              <h3>{name}</h3>
              <strong>{price}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="faq">
        <div className="section-header">
          <h2>FAQ</h2>
          <p>
            Fiscal, pagamentos online, iFood, TEF e offline completo entram por fases para evitar
            risco juridico, operacional e tecnico antes da validacao comercial.
          </p>
        </div>
      </section>

      <footer className="footer">
        GiroMesa - templates legais, fiscal e LGPD precisam de revisao juridica, contabil e fiscal.
      </footer>
    </main>
  );
}
