import {
  ArrowRight,
  BarChart3,
  ChefHat,
  ClipboardCheck,
  Clock3,
  CreditCard,
  QrCode,
  ShieldCheck,
  Soup,
  Sparkles,
  Store,
  Warehouse,
} from "lucide-react";

const features = [
  {
    icon: ClipboardCheck,
    title: "PDV de salao e balcao",
    body: "Mesas, comandas, itens, observacoes, descontos controlados e fechamento sem perder historico.",
  },
  {
    icon: ChefHat,
    title: "KDS simples e claro",
    body: "Cozinha e bar recebem tickets por estacao, com prioridade, tempo de preparo e cancelamentos visiveis.",
  },
  {
    icon: QrCode,
    title: "Cardapio QR por unidade",
    body: "Menu público elegante, preparado para evoluir para pedido pelo cliente e chamada de garçom.",
  },
  {
    icon: Warehouse,
    title: "Estoque com ficha tecnica",
    body: "Baixa de insumos por receita, estoque minimo, reversoes auditadas e visao de ruptura.",
  },
  {
    icon: CreditCard,
    title: "Caixa e pagamentos",
    body: "Pagamentos manuais no MVP, conciliacao de turno e base pronta para Asaas e Pix online.",
  },
  {
    icon: ShieldCheck,
    title: "Seguranca multi-tenant",
    body: "Tenant no backend, permissoes por perfil, auditoria append-only e webhooks idempotentes.",
  },
];

const liveMetrics = [
  ["R$ 8.742", "vendidos hoje"],
  ["18/30", "mesas ocupadas"],
  ["11 min", "tempo medio KDS"],
  ["2", "alertas criticos"],
] as const;

const operations = [
  ["Mesa M12", "2 burgers, 1 chopp, 1 brownie", "preparando", "14 min"],
  ["Comanda C07", "Pizza meia lua, soda italiana", "pronto", "08 min"],
  ["Balcao 03", "Combo executivo", "pagamento", "R$ 42"],
] as const;

const plans = [
  ["Starter", "R$ 149", "PDV, mesas, cardápio QR e relatórios básicos."],
  ["Professional", "R$ 299", "KDS, estoque, ficha tecnica e caixa completo."],
  ["Premium", "R$ 499", "Multi-filial, automacoes, WhatsApp e dashboards."],
  ["Enterprise", "Sob consulta", "Ambiente dedicado, suporte prioritario e limites customizados."],
] as const;

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <nav className="nav-links" aria-label="Navegacao principal">
          <a href="#operacao">Operacao</a>
          <a href="#modulos">Modulos</a>
          <a href="#planos">Planos</a>
          <a href="/manual">Manual</a>
          <a href="/app">Demo</a>
        </nav>
        <div className="nav-actions">
          <a className="button ghost" href="/login">
            Login
          </a>
          <a className="button primary" href="/app">
            Ver demo <ArrowRight size={17} />
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">
            <Soup size={18} /> SaaS para bares, restaurantes e pubs
          </span>
          <h1>GiroMesa</h1>
          <p>
            Uma operação de salão, cozinha, caixa e cardápio digital com a velocidade que o turno
            exige e o controle que a gestão precisa.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="/app">
              Abrir demo operacional <ArrowRight size={18} />
            </a>
            <a className="button secondary on-dark" href="/m/bar-aurora-demo">
              Ver cardápio QR
            </a>
          </div>
        </div>
        <aside className="hero-brief" aria-label="Resumo operacional do demo">
          <div>
            <span>Bar Aurora</span>
            <strong>Turno jantar em andamento</strong>
          </div>
          <div className="hero-brief-grid">
            {liveMetrics.map(([value, label]) => (
              <span key={label}>
                <strong>{value}</strong>
                {label}
              </span>
            ))}
          </div>
        </aside>
      </section>

      <section className="section operation-section" id="operacao">
        <div className="section-header split">
          <div>
            <span className="section-kicker">Produto de operacao</span>
            <h2>O turno inteiro em uma tela que da para usar sob pressao.</h2>
          </div>
          <p>
            A demo prioriza o essencial para vender, produzir, receber e auditar sem trocar de
            sistema no meio do atendimento.
          </p>
        </div>
        <div className="operation-board">
          <div className="board-column">
            <div className="board-header">
              <Store size={18} />
              <strong>Salao agora</strong>
            </div>
            {operations.map(([code, items, status, detail]) => (
              <article className="order-card" key={code}>
                <div>
                  <strong>{code}</strong>
                  <p>{items}</p>
                </div>
                <span>{status}</span>
                <small>{detail}</small>
              </article>
            ))}
          </div>
          <div className="board-column emphasis">
            <div className="board-header">
              <ChefHat size={18} />
              <strong>KDS</strong>
            </div>
            <article className="kitchen-card">
              <Clock3 size={20} />
              <div>
                <strong>Chapa em atencao</strong>
                <p>M12 esta perto do SLA e precisa de prioridade.</p>
              </div>
            </article>
            <article className="kitchen-card calm">
              <Sparkles size={20} />
              <div>
                <strong>Bar sem gargalo</strong>
                <p>4 tickets prontos nos ultimos 10 minutos.</p>
              </div>
            </article>
          </div>
          <div className="board-column">
            <div className="board-header">
              <BarChart3 size={18} />
              <strong>Gestao</strong>
            </div>
            <div className="mini-ledger">
              <span>Ticket medio</span>
              <strong>R$ 74,20</strong>
              <span>CMV estimado</span>
              <strong>31,8%</strong>
              <span>Caixa atual</span>
              <strong>R$ 2.184</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="modulos">
        <div className="section-header">
          <span className="section-kicker">MVP comercial</span>
          <h2>Modulos prontos para demonstrar valor desde o primeiro cliente.</h2>
          <p>
            O foco inicial e um produto cloud-first, auditavel e preparado para integracoes
            brasileiras sem antecipar complexidade fiscal ou TEF antes da validacao.
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

      <section className="section pricing-band" id="planos">
        <div className="section-header split">
          <div>
            <span className="section-kicker">Planos iniciais</span>
            <h2>Preco simples para validar mercado sem travar evolucao.</h2>
          </div>
          <p>
            Valores de referencia para venda piloto. Fiscal real, WhatsApp, iFood, TEF e offline
            completo entram em fases controladas.
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

      <footer className="footer">
        GiroMesa - operacao food service, SaaS multi-tenant e integracoes brasileiras por fases.
      </footer>
    </main>
  );
}
