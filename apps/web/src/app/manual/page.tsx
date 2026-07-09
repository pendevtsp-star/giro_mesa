import {
  ArrowRight,
  BadgeCheck,
  ChefHat,
  ClipboardList,
  CreditCard,
  MessageSquareMore,
  LifeBuoy,
  MapPinned,
  Printer,
  QrCode,
  ShieldCheck,
  TimerReset,
  Users,
  Warehouse,
} from "lucide-react";

const sections = [
  {
    icon: BadgeCheck,
    title: "Primeiro acesso",
    text: "Entre pelo convite, troque a senha e ative MFA para perfis administrativos.",
  },
  {
    icon: Users,
    title: "Equipe",
    text: "Crie usuarios individuais para dono, gerente, caixa, garcom, cozinha e bar.",
  },
  {
    icon: ClipboardList,
    title: "Mesas e PDV",
    text: "Abra mesa ou balcao, lance itens, envie para preparo e acompanhe a conta.",
  },
  {
    icon: ChefHat,
    title: "KDS",
    text: "Cozinha e bar recebem tickets por estacao sem apagar cancelamentos do historico.",
  },
  {
    icon: CreditCard,
    title: "Caixa",
    text: "Registre pagamentos manuais, acompanhe totais e feche o turno com conciliacao.",
  },
  {
    icon: Warehouse,
    title: "Estoque",
    text: "Controle insumos, minimo, ajustes, ficha tecnica e reversoes auditadas.",
  },
  {
    icon: Printer,
    title: "Impressao",
    text: "Cadastre impressoras por filial e direcione comandas para cozinha, bar ou caixa.",
  },
  {
    icon: QrCode,
    title: "Cardapio QR",
    text: "Disponibilize menu por mesa e prepare o fluxo para pedidos diretos pelo cliente.",
  },
  {
    icon: ShieldCheck,
    title: "Fiscal e LGPD",
    text: "Use provider fiscal, mantenha auditoria e valide documentos legais com especialistas.",
  },
];

const checklist = [
  "Cadastrar unidade, mesas e setores de preparo.",
  "Cadastrar equipe e revisar permissoes.",
  "Configurar cardapio, precos e disponibilidade.",
  "Configurar estoque dos itens criticos.",
  "Testar abertura de mesa, envio ao KDS e fechamento de conta.",
  "Validar fiscal com contador antes de venda real.",
];

const roleCards = [
  {
    title: "Dono / administrador",
    goal: "Governanca, permissoes, saude do negocio e decisao final.",
    bullets: [
      "Ativar MFA, revisar usuarios e validar o fechamento do turno.",
      "Acompanhar relatorios, fiscal pendente e estoque critico.",
      "Aprovar ajustes sensiveis e politica operacional.",
    ],
  },
  {
    title: "Gerente / lider de turno",
    goal: "Garantir ritmo da operacao e destravar excecoes.",
    bullets: [
      "Distribuir equipe e acompanhar mesas com maior risco de atraso.",
      "Apoiar cancelamentos, descontos e divergencias de caixa.",
      "Fechar gargalos entre salao, cozinha, bar e caixa.",
    ],
  },
  {
    title: "Equipe operacional",
    goal: "Executar o turno com rapidez e rastreabilidade.",
    bullets: [
      "Garcom abre mesa, lanca itens e envia para preparo.",
      "Caixa registra recebimento e fecha conta com conferencia.",
      "Cozinha e bar avancam tickets sem perder historico.",
    ],
  },
];

const onboardingSteps = [
  ["Dia 1", "Configurar unidade, equipe-chave, impressoras e cardapio base."],
  ["Dia 2", "Treinar garcom, caixa e cozinha com fluxo completo em ambiente controlado."],
  ["Dia 3", "Rodar turno assistido, revisar divergencias e ajustar permissoes."],
  ["Go-live", "Liberar operacao integral com acompanhamento de fechamento e suporte."],
] as const;

const supportExpectations = [
  "Problema de operacao em andamento: informar mesa/comanda, horario e usuario.",
  "Falha de impressao: informar filial, impressora/rota e ultimo job visivel.",
  "Divergencia de caixa: anexar valor esperado, valor contado e operador.",
  "Fiscal: informar pedido, documento, horario e mensagem de erro exibida.",
];

const implementationPath = [
  {
    title: "Configuracao base",
    text: "Cadastre filial, mesas, impressoras, setores de preparo, cardapio e equipe-chave.",
  },
  {
    title: "Treino controlado",
    text: "Rode um turno de treino com garcom, cozinha e caixa seguindo um roteiro fechado.",
  },
  {
    title: "Turno assistido",
    text: "Coloque uma operacao real pequena no sistema e revise divergencias ao final.",
  },
  {
    title: "Go-live completo",
    text: "Liberte a casa inteira apenas depois de validar abertura, preparo, pagamento, impressao e fechamento.",
  },
];

const profileRoutines = [
  ["Dono", "Acompanhar relatorios, planos, permissoes, auditoria e indicadores do turno."],
  ["Gerente", "Conferir salao, liberar ajustes, revisar estoque critico e apoiar fechamento."],
  ["Caixa", "Registrar pagamentos, emitir pre-conta, fechar conta e reconciliar caixa."],
  ["Garcom", "Abrir mesa, lancar itens, enviar para KDS e acompanhar solicitacoes QR."],
  ["Cozinha/bar", "Avancar tickets, destacar cancelamentos e manter historico visivel."],
] as const;

export default function ManualPage() {
  return (
    <main className="manual-page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <nav className="nav-links" aria-label="Manual GiroMesa">
          <a href="#inicio">Inicio</a>
          <a href="#rotina">Rotina</a>
          <a href="#checklist">Checklist</a>
          <a href="/app">Demo</a>
        </nav>
        <a className="button primary" href="/login">
          Acessar sistema
        </a>
      </header>

      <section className="manual-hero" id="inicio">
        <div>
          <span className="section-kicker">Manual do cliente</span>
          <h1>Como operar o GiroMesa no dia a dia.</h1>
          <p>
            Um guia simples para donos, gerentes, caixas, garcons e cozinha com os primeiros passos
            de implantacao e rotina.
          </p>
        </div>
        <aside>
          <strong>Implantacao guiada</strong>
          <span>Do cadastro inicial ao fechamento do primeiro turno.</span>
          <a className="button secondary compact" href="/app">
            Abrir demo <ArrowRight size={16} />
          </a>
        </aside>
      </section>

      <section className="manual-grid" id="rotina">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <article className="manual-section" key={section.title}>
              <Icon size={22} />
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </article>
          );
        })}
      </section>

      <section className="manual-checklist" id="checklist">
        <div>
          <span className="section-kicker">Antes de rodar</span>
          <h2>Checklist do primeiro atendimento</h2>
          <p>
            Use esta lista para validar o ambiente com calma antes de colocar o salao inteiro no
            sistema.
          </p>
        </div>
        <ol>
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section className="manual-checklist">
        <div>
          <span className="section-kicker">Implantacao comercial</span>
          <h2>Plano de onboarding recomendado</h2>
          <p>Sequencia pratica para colocar um cliente para rodar sem improviso operacional.</p>
        </div>
        <ol>
          {onboardingSteps.map(([day, step]) => (
            <li key={day}>
              <strong>{day}:</strong> {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="manual-grid">
        {implementationPath.map((step, index) => (
          <article className="manual-section" key={step.title}>
            {index === 0 ? <MapPinned size={22} /> : index === 1 ? <Users size={22} /> : index === 2 ? <TimerReset size={22} /> : <BadgeCheck size={22} />}
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </section>

      <section className="manual-checklist">
        <div>
          <span className="section-kicker">Rotina por perfil</span>
          <h2>Quem faz o que</h2>
          <p>Use esta divisao para treinar a equipe sem dar permissoes alem do necessario.</p>
        </div>
        <ol>
          {profileRoutines.map(([profile, routine]) => (
            <li key={profile}>
              <strong>{profile}:</strong> {routine}
            </li>
          ))}
        </ol>
      </section>

      <section className="manual-grid">
        {roleCards.map((role) => (
          <article className="manual-section" key={role.title}>
            <MessageSquareMore size={22} />
            <h2>{role.title}</h2>
            <p>{role.goal}</p>
            <ul>
              {role.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="manual-support">
        <LifeBuoy size={22} />
        <div>
          <h2>Ao pedir suporte</h2>
          <p>
            Informe estabelecimento, filial, usuario, horario, mesa/comanda ou pedido envolvido e
            print da tela quando possivel.
          </p>
          <ul>
            {supportExpectations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <a className="button secondary" href="/app">
          Abrir demo
        </a>
      </section>

      <section className="manual-checklist">
        <div>
          <span className="section-kicker">Criterio de go-live</span>
          <h2>Quando o estabelecimento pode virar operacao principal</h2>
          <p>Sem isso, o risco de retrabalho no primeiro pico de atendimento continua alto.</p>
        </div>
        <ol>
          <li>Abertura de mesa/comanda funcionando sem bloqueio.</li>
          <li>Itens chegando corretamente ao KDS e/ou impressao de producao.</li>
          <li>Pagamento manual e fechamento de conta validados com a equipe.</li>
          <li>Fechamento de caixa revisado pelo responsavel do turno.</li>
          <li>Impressora principal e rota critica testadas.</li>
          <li>Administrador com MFA ativo e usuarios individuais configurados.</li>
        </ol>
      </section>
    </main>
  );
}
