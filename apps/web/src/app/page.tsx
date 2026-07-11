import {
  ArrowRight,
  BarChart3,
  Check,
  ChefHat,
  CircleDollarSign,
  Clock3,
  QrCode,
  ShieldCheck,
  Store,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";
import Image from "next/image";

const benefits = [
  {
    icon: UtensilsCrossed,
    title: "Atendimento que acompanha o salão",
    body: "Mesas, comandas e balcão em uma operação pensada para o ritmo do serviço.",
  },
  {
    icon: ChefHat,
    title: "Cozinha e bar no mesmo compasso",
    body: "Tickets por estação, prioridades visíveis e histórico de cancelamentos sem ruído.",
  },
  {
    icon: Warehouse,
    title: "Gestão que enxerga a margem",
    body: "Estoque, ficha técnica, caixa e relatórios para decidir antes do fechamento.",
  },
] as const;

const proof = [
  "PDV para balcão, mesa e comanda",
  "KDS, cardápio QR e impressão por rota",
  "Caixa, estoque e relatórios executivos",
  "Usuários por função, MFA e auditoria",
] as const;

const modules = [
  [
    "PDV e salão",
    "Abra mesas, lance pedidos e faça pagamentos parciais sem perder contexto.",
    Store,
  ],
  ["Cozinha e bar", "Envie tickets ao KDS e acompanhe o preparo em tempo real.", ChefHat],
  ["Gestão financeira", "Leia recebimentos, divergências de caixa e alertas do turno.", BarChart3],
  [
    "Cardápio digital",
    "Ofereça QR por mesa com pedido assistido e chamada de atendimento.",
    QrCode,
  ],
] as const;

export default function HomePage() {
  return (
    <main className="sales-page">
      <header className="sales-topbar">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <nav className="sales-nav" aria-label="Navegação principal">
          <a href="#produto">Produto</a>
          <a href="#operacao">Operação</a>
          <a href="#seguranca">Segurança</a>
          <a href="/manual">Manual</a>
        </nav>
        <div className="sales-actions">
          <a className="button ghost" href="/login">
            Entrar
          </a>
          <a className="button primary" href="/app">
            Conhecer a demo <ArrowRight size={16} />
          </a>
        </div>
      </header>

      <section className="sales-hero" id="produto">
        <div className="sales-hero-copy">
          <span className="sales-eyebrow">
            <CircleDollarSign size={16} /> Gestão food service
          </span>
          <h1>Gestão que gira. Resultados que ficam.</h1>
          <p>
            GiroMesa reúne salão, cozinha, caixa, estoque e cardápio digital em uma operação
            inteligente, prática e confiável para a equipe e para quem toma decisões.
          </p>
          <div className="sales-hero-actions">
            <a className="button primary" href="/app">
              Entrar na demo guiada <ArrowRight size={18} />
            </a>
            <a className="button secondary" href="/m/bar-aurora-demo">
              Explorar cardápio QR
            </a>
          </div>
          <ul className="sales-proof-list">
            {proof.map((item) => (
              <li key={item}>
                <Check size={16} /> {item}
              </li>
            ))}
          </ul>
        </div>
        <figure className="sales-product-frame">
          <div className="sales-window-bar">
            <span /> <span /> <span />
            <strong>Visão do turno</strong>
            <Clock3 size={16} />
          </div>
          <Image
            src="/images/giro-mesa-dashboard.png"
            alt="Painel do GiroMesa com mesas, pedidos e caixa"
            width={1280}
            height={800}
            priority
          />
          <div className="sales-float-card">
            <span>Caixa do turno</span>
            <strong>R$ 2.184,00</strong>
            <small>conferência em andamento</small>
          </div>
        </figure>
      </section>

      <section className="sales-band" id="operacao">
        <div>
          <span className="section-kicker">Da chegada ao fechamento</span>
          <h2>Uma rotina operacional sem troca de contexto.</h2>
        </div>
        <p>
          Cada função enxerga o que precisa fazer: garçom atende, cozinha produz, caixa recebe e a
          gestão acompanha o que exige atenção.
        </p>
      </section>

      <section className="sales-benefits">
        {benefits.map(({ icon: Icon, title, body }) => (
          <article key={title}>
            <span>
              <Icon size={22} />
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="sales-modules">
        <div className="sales-section-heading">
          <span className="section-kicker">Uma base que evolui com a casa</span>
          <h2>Comece pelo que faz diferença em um turno de verdade.</h2>
          <p>
            O GiroMesa é cloud-first e deixa a operação pronta para crescer com integrações
            controladas.
          </p>
        </div>
        <div className="sales-module-grid">
          {modules.map(([title, body, Icon]) => (
            <article key={title}>
              <Icon size={24} />
              <h3>{title}</h3>
              <p>{body}</p>
              <a href="/app">
                Ver na demo <ArrowRight size={15} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="sales-security" id="seguranca">
        <div>
          <span className="sales-eyebrow">
            <ShieldCheck size={16} /> Operação com controle
          </span>
          <h2>Cada ação importante deixa rastro.</h2>
          <p>
            Permissões por perfil, MFA para acessos sensíveis, auditoria e isolamento entre
            estabelecimentos fazem parte da base, não de um complemento.
          </p>
        </div>
        <dl>
          <div>
            <dt>Multi-tenant</dt>
            <dd>Dados isolados por estabelecimento.</dd>
          </div>
          <div>
            <dt>Perfis de acesso</dt>
            <dd>Equipe com apenas as permissões necessárias.</dd>
          </div>
          <div>
            <dt>Auditoria</dt>
            <dd>Cancelamentos e ajustes ficam rastreáveis.</dd>
          </div>
        </dl>
      </section>

      <section className="sales-implementation">
        <div className="sales-section-heading">
          <span className="section-kicker">Implantação sem improviso</span>
          <h2>Uma casa preparada para rodar, não apenas para assistir uma demonstração.</h2>
          <p>
            O GiroMesa organiza a entrada do cliente por etapas operacionais que a equipe consegue
            validar.
          </p>
        </div>
        <ol>
          <li>
            <strong>1. Configuração</strong>
            <span>Unidade, cardápio, mesas, equipe e permissões.</span>
          </li>
          <li>
            <strong>2. Treino assistido</strong>
            <span>Garçom, cozinha, caixa e impressão em fluxo controlado.</span>
          </li>
          <li>
            <strong>3. Primeiro turno</strong>
            <span>Acompanhamento de pedidos, recebimentos e fechamento.</span>
          </li>
          <li>
            <strong>4. Evolução</strong>
            <span>Relatórios, estoque, integrações e novas unidades por fase.</span>
          </li>
        </ol>
      </section>

      <section className="sales-cta">
        <div>
          <span className="section-kicker">Próximo passo</span>
          <h2>Veja o GiroMesa no ritmo de um estabelecimento.</h2>
          <p>
            A demo usa um cenário operacional completo. Entre, explore e veja o que a sua equipe vai
            operar.
          </p>
        </div>
        <a className="button primary" href="/app">
          Acessar demo <ArrowRight size={18} />
        </a>
      </section>

      <footer className="sales-footer">
        <span>GiroMesa</span>
        <div>
          <a href="/manual">Manual</a>
          <a href="/login">Acessar sistema</a>
          <a href="/status">Status</a>
        </div>
      </footer>
    </main>
  );
}
