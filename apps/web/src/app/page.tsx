import {
  ArrowRight,
  BarChart3,
  Check,
  ChefHat,
  Clock3,
  Menu,
  QrCode,
  ShieldCheck,
  Store,
  UtensilsCrossed,
  Warehouse,
  Wine,
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

const modules = [
  {
    icon: Store,
    title: "PDV e salão",
    body: "Abra mesas, lance pedidos e faça pagamentos parciais sem perder contexto.",
  },
  {
    icon: ChefHat,
    title: "Cozinha e bar",
    body: "Envie tickets ao KDS e acompanhe o preparo em tempo real.",
  },
  {
    icon: BarChart3,
    title: "Gestão financeira",
    body: "Leia recebimentos, divergências de caixa e alertas do turno.",
  },
  {
    icon: QrCode,
    title: "Cardápio digital",
    body: "Ofereça QR por mesa com pedido assistido e chamada de atendimento.",
    href: "/m/bar-aurora-demo",
    cta: "Abrir cardápio de demonstração",
  },
  {
    icon: Wine,
    title: "DoseClub integrado",
    body: "Controle clubes de destilados e doses com uma operação independente, conectada quando fizer sentido.",
    href: "https://doseclube.giromesa.com.br",
    cta: "Conhecer o DoseClub",
  },
] as const;

const plans = [
  {
    code: "starter",
    name: "Starter",
    price: "R$ 149",
    body: "Para casas começando a organizar PDV, mesas e caixa.",
    bullets: ["1 unidade", "Até 5 usuários", "Cardápio, PDV e caixa"],
    featured: false,
  },
  {
    code: "professional",
    name: "Professional",
    price: "R$ 299",
    body: "Para operação completa com salão, KDS, estoque e relatórios.",
    bullets: ["2 unidades", "Até 15 usuários", "KDS, estoque e relatórios"],
    featured: true,
  },
  {
    code: "premium",
    name: "Premium",
    price: "R$ 499",
    body: "Para multiunidade e operação com acompanhamento prioritário.",
    bullets: ["5 unidades", "Até 40 usuários", "Gestão avançada e suporte"],
    featured: false,
  },
] as const;

const photos = ["bar", "drink", "kitchen", "counter", "dining"] as const;
const photoLoop = [
  ...photos.map((photo) => ({ id: `${photo}-first`, photo })),
  ...photos.map((photo) => ({ id: `${photo}-second`, photo })),
] as const;

function Brand() {
  return (
    <span className="landing-brand">
      <Image
        className="landing-brand-logo"
        src="/images/giromesa-symbol.svg"
        alt=""
        width={40}
        height={40}
        aria-hidden="true"
      />
      <span>
        Giro<strong>Mesa</strong>
      </span>
    </span>
  );
}

function DashboardPreview() {
  return (
    <div className="landing-dashboard-wrap">
      <div className="landing-dashboard-photo" aria-hidden="true" />
      <figure className="landing-dashboard">
        <div className="landing-window-bar">
          <span className="landing-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <Clock3 size={15} /> Visão do turno
          </span>
        </div>
        <Image
          src="/images/giro-mesa-dashboard.png"
          alt="Painel do GiroMesa com mesas, pedidos e caixa do turno"
          width={1280}
          height={800}
          priority
        />
      </figure>
      <aside className="landing-cash-card" aria-label="Resumo de caixa de demonstração">
        <span className="landing-cash-label">Caixa do turno</span>
        <strong>R$ 2.184,00</strong>
        <small>
          <i aria-hidden="true" /> conferência em andamento
        </small>
      </aside>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>

      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <a href="/" aria-label="GiroMesa — página inicial">
            <Brand />
          </a>

          <nav className="landing-nav" aria-label="Navegação principal">
            <a href="#produto">Produto</a>
            <a href="#operacao">Operação</a>
            <a href="#seguranca">Segurança</a>
            <a href="#planos">Planos</a>
            <a href="#ecossistema">DoseClub</a>
            <a href="/manual">Manual</a>
          </nav>

          <div className="landing-header-actions">
            <a className="landing-login-link" href="/login">
              Entrar
            </a>
            <a
              className="landing-button landing-button-primary landing-button-small"
              href="/contato?produto=giromesa&origin=header"
            >
              Solicitar acesso piloto <ArrowRight size={16} />
            </a>
          </div>

          <details className="landing-mobile-menu">
            <summary aria-label="Abrir menu">
              <Menu size={24} />
            </summary>
            <nav aria-label="Navegação para celular">
              <a href="#produto">Produto</a>
              <a href="#operacao">Operação</a>
              <a href="#seguranca">Segurança</a>
              <a href="#planos">Planos</a>
              <a href="#ecossistema">DoseClub</a>
              <a href="/manual">Manual</a>
              <a href="/login">Entrar</a>
              <a
                className="landing-button landing-button-primary"
                href="/contato?produto=giromesa&origin=mobile_nav"
              >
                Solicitar acesso piloto
              </a>
            </nav>
          </details>
        </div>
      </header>

      <main id="conteudo">
        <section className="landing-hero" id="produto">
          <div className="landing-ambient landing-ambient-blue" aria-hidden="true" />
          <div className="landing-ambient landing-ambient-yellow" aria-hidden="true" />
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy">
              <h1>
                Gestão que gira.
                <span>Resultados que ficam.</span>
              </h1>
              <p>
                GiroMesa reúne salão, cozinha, caixa, estoque e cardápio digital em uma operação
                inteligente e prática para a equipe do seu bar ou restaurante.
              </p>
              <div className="landing-hero-actions">
                <a
                  className="landing-button landing-button-primary"
                  href="/contato?produto=giromesa&origin=hero"
                >
                  Solicitar acesso ao piloto <ArrowRight size={18} />
                </a>
                <a className="landing-button landing-button-secondary" href="/m/bar-aurora-demo">
                  <QrCode size={18} /> Explorar cardápio QR
                </a>
              </div>
              <ul className="landing-proof-list">
                {[
                  "PDV para balcão, mesa e comanda",
                  "KDS, cardápio QR e impressão por rota",
                  "Caixa, estoque e relatórios executivos",
                  "Usuários por função, MFA e auditoria",
                ].map((item) => (
                  <li key={item}>
                    <Check size={16} /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section className="landing-vibe" aria-labelledby="ritmo-title">
          <p id="ritmo-title">Feito para o ritmo do seu salão</p>
          <div className="landing-photo-rail">
            <div className="landing-photo-track">
              {photoLoop.map(({ id, photo }) => (
                <div
                  className={`landing-photo landing-photo-${photo}`}
                  key={id}
                  role="img"
                  aria-label="Ambiente de bar e restaurante em operação"
                />
              ))}
            </div>
          </div>
        </section>

        <section className="landing-operation" id="operacao">
          <div className="landing-container">
            <header className="landing-section-heading landing-section-heading-centered">
              <span className="landing-section-kicker">Da chegada ao fechamento</span>
              <h2>Uma rotina operacional sem troca de contexto.</h2>
              <p>
                Cada função enxerga o que precisa fazer: garçom atende, cozinha produz, caixa recebe
                e a gestão acompanha o que exige atenção.
              </p>
            </header>
            <div className="landing-benefit-grid">
              {benefits.map(({ icon: Icon, title, body }) => (
                <article key={title}>
                  <span className="landing-icon-tile">
                    <Icon size={28} />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-modules">
          <div className="landing-container">
            <header className="landing-section-heading">
              <span className="landing-section-kicker">Uma base que evolui com a casa</span>
              <h2>Comece pelo que faz diferença em um turno de verdade.</h2>
              <p>
                O GiroMesa é cloud-first e deixa a operação pronta para crescer com integrações
                controladas.
              </p>
            </header>
            <div className="landing-module-grid">
              {modules.map(({ icon: Icon, title, body, ...module }) => (
                <article key={title}>
                  <Icon size={28} strokeWidth={1.6} />
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <a
                    href={
                      "href" in module ? module.href : "/contato?produto=giromesa&origin=module"
                    }
                  >
                    {"cta" in module ? module.cta : "Ativar no meu ambiente"}
                    <ArrowRight size={15} />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-ecosystem" id="ecossistema" aria-labelledby="ecosystem-title">
          <div className="landing-container landing-ecosystem-card">
            <div className="landing-ecosystem-mark" aria-hidden="true">
              <Wine size={28} strokeWidth={1.8} />
            </div>
            <div>
              <span className="landing-section-kicker">Ecossistema GiroMesa</span>
              <h2 id="ecosystem-title">DoseClub, por GiroMesa.</h2>
              <p>
                Uma experiência própria para clubes de whisky e destilados: combos, doses e estoque
                compartilhado quando a sua casa quiser operar os dois produtos.
              </p>
            </div>
            <a
              className="landing-button landing-button-secondary"
              href="https://doseclube.giromesa.com.br"
              target="_blank"
              rel="noreferrer"
            >
              Conhecer o DoseClub <ArrowRight size={17} />
            </a>
          </div>
        </section>

        <section className="landing-security" id="seguranca">
          <div className="landing-container landing-security-grid">
            <div>
              <span className="landing-eyebrow">
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
          </div>
        </section>

        <section className="landing-pricing" id="planos">
          <div className="landing-container">
            <header className="landing-section-heading landing-section-heading-centered">
              <span className="landing-section-kicker">Programa piloto por convite</span>
              <h2>Planos claros para uma implantação acompanhada.</h2>
              <p>
                A ativação é alinhada com a operação antes do primeiro turno. Valores e recursos são
                confirmados no momento da contratação.
              </p>
            </header>
            <div className="landing-plan-grid">
              {plans.map((plan) => (
                <article className={plan.featured ? "is-featured" : ""} key={plan.name}>
                  <h3>{plan.name}</h3>
                  <div className="landing-price">
                    <strong>{plan.price}</strong>
                    <span className="landing-price-period">/mês</span>
                  </div>
                  <p>{plan.body}</p>
                  <ul>
                    {plan.bullets.map((bullet) => (
                      <li key={bullet}>
                        <Check size={16} /> {bullet}
                      </li>
                    ))}
                  </ul>
                  <a
                    className={`landing-button ${
                      plan.featured ? "landing-button-primary" : "landing-button-secondary"
                    }`}
                    href={`/contato?produto=giromesa&plan=${plan.code}&origin=pricing`}
                  >
                    Solicitar este plano
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-implementation">
          <div className="landing-container landing-implementation-grid">
            <header className="landing-section-heading">
              <span className="landing-section-kicker">Implantação sem improviso</span>
              <h2>Processo, equipe e acompanhamento desde o primeiro turno.</h2>
              <p>
                O GiroMesa organiza a entrada do cliente em etapas que a equipe consegue validar.
              </p>
            </header>
            <ol>
              {[
                ["01", "Configuração", "Unidade, cardápio, mesas, equipe e permissões."],
                [
                  "02",
                  "Treino assistido",
                  "Garçom, cozinha, caixa e impressão em fluxo controlado.",
                ],
                ["03", "Primeiro turno", "Pedidos, recebimentos e fechamento acompanhados."],
                ["04", "Evolução", "Relatórios, estoque, integrações e novas unidades por fase."],
              ].map(([number, title, body]) => (
                <li key={number}>
                  <span>{number}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-ambient landing-ambient-blue" aria-hidden="true" />
          <div className="landing-container">
            <span className="landing-section-kicker">Próximo passo</span>
            <h2>Pronto para acelerar sua operação?</h2>
            <p>
              Solicite acesso ao programa piloto para validar mesas, pedidos, caixa, relatórios e
              equipe em um ambiente acompanhado.
            </p>
            <a
              className="landing-button landing-button-primary"
              href="/contato?produto=giromesa&origin=final_cta"
            >
              Solicitar acesso piloto <ArrowRight size={20} />
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <a href="/" aria-label="GiroMesa — página inicial">
            <Brand />
          </a>
          <nav aria-label="Links institucionais">
            <a href="/manual">Manual</a>
            <a href="/login">Acessar sistema</a>
            <a href="/termos">Termos</a>
            <a href="/privacidade">Privacidade</a>
            <a href="https://doseclube.giromesa.com.br" target="_blank" rel="noreferrer">
              DoseClub
            </a>
            <a href="/status">Status</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
