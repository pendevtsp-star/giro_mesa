"use client";

import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getPrinterConnectorConfig,
  getSession,
  listProducts,
  listTables,
  listUsers,
  type TenantSession,
} from "../../../lib/giromesa-api";

type Step = { title: string; description: string; href: string; done: boolean };

export default function OnboardingPage() {
  const [session, setSession] = useState<TenantSession | null>(null);
  const [products, setProducts] = useState(0);
  const [tables, setTables] = useState(0);
  const [users, setUsers] = useState(0);
  const [printerConfigured, setPrinterConfigured] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const activeSession = await getSession();
        setSession(activeSession);
        const [productRows, tableRows, userRows, connector] = await Promise.all([
          listProducts(),
          activeSession.branchId ? listTables(activeSession.branchId) : Promise.resolve([]),
          listUsers(),
          getPrinterConnectorConfig(),
        ]);
        setProducts(productRows.length);
        setTables(tableRows.length);
        setUsers(userRows.length);
        setPrinterConfigured(connector.status === "active");
      } catch {
        // A página continua útil para orientar a demonstração sem sessão ativa.
      } finally {
        setReady(true);
      }
    }
    void load();
  }, []);

  const steps = useMemo<Step[]>(
    () => [
      {
        title: "Defina a operação",
        description: "Confira unidade, mesas e fluxo de atendimento antes do primeiro turno.",
        href: "/app",
        done: tables > 0,
      },
      {
        title: "Monte o cardápio",
        description: "Cadastre itens, preços, canais e disponibilidade do que será vendido.",
        href: "/app",
        done: products > 0,
      },
      {
        title: "Convide a equipe",
        description:
          "Crie acessos individuais e entregue a cada pessoa apenas as permissões necessárias.",
        href: "/app/team",
        done: users > 1,
      },
      {
        title: "Proteja a administração",
        description: "Ative MFA para donos, financeiro e demais perfis sensíveis.",
        href: "/app/security",
        done: Boolean(session && !session.mfaRequired),
      },
      {
        title: "Prepare a impressão",
        description: "Conecte a impressora e teste as rotas de cozinha, bar e caixa.",
        href: "/app",
        done: printerConfigured,
      },
      {
        title: "Faça o turno de teste",
        description: "Abra mesa, envie pedido ao KDS, receba pagamento e confira o caixa.",
        href: "/app/waiter",
        done: false,
      },
    ],
    [printerConfigured, products, session, tables, users],
  );
  const completed = steps.filter((step) => step.done).length;

  return (
    <main className="onboarding-page">
      <header className="onboarding-topbar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </header>
      <section className="onboarding-hero">
        <div>
          <span className="section-kicker">Implantação guiada</span>
          <h1>Prepare a casa para o primeiro turno.</h1>
          <p>Um roteiro operacional simples para transformar configuração em rotina de verdade.</p>
        </div>
        <aside>
          <BadgeCheck size={24} />
          <strong>
            {completed} de {steps.length}
          </strong>
          <span>etapas preparadas</span>
        </aside>
      </section>
      <section className="onboarding-progress" aria-label="Progresso da implantação">
        <span style={{ width: `${(completed / steps.length) * 100}%` }} />
      </section>
      <section className="onboarding-list">
        {steps.map((step, index) => (
          <article
            className={step.done ? "onboarding-step complete" : "onboarding-step"}
            key={step.title}
          >
            <span className="onboarding-step-icon">
              {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </span>
            <div>
              <span>Etapa {index + 1}</span>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
            </div>
            <a className="button secondary compact" href={step.href}>
              {step.done ? "Revisar" : "Configurar"} <ArrowRight size={15} />
            </a>
          </article>
        ))}
      </section>
      <section className="onboarding-note">
        <ShieldCheck size={20} />
        <p>
          <strong>Antes do go-live:</strong> valide o fluxo completo com uma mesa de teste e
          mantenha um administrador com MFA ativo.
        </p>
      </section>
      {!ready ? (
        <p className="onboarding-loading">Lendo a configuração do estabelecimento...</p>
      ) : null}
    </main>
  );
}
