"use client";

import { ArrowRight, Check, LockKeyhole, Mail, Phone, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, startTrial } from "../../lib/giromesa-api";

const setupItems = [
  "Ambiente próprio por 7 dias",
  "Sem cartão na criação da conta",
  "Painel, PDV, mesas, caixa e relatórios liberados",
  "Ativação de cobrança apenas para continuar após o teste",
] as const;

const activationSteps = [
  "Criamos seu ambiente isolado e a filial inicial.",
  "Você entra direto no assistente de implantação.",
  "Seu time testa PDV, salão, QR, KDS e fechamento.",
  "A assinatura só é ativada se você decidir continuar.",
] as const;

const trialPlans = {
  starter: {
    name: "Starter",
    price: "R$ 149/mês após o teste",
    detail: "1 unidade",
  },
  professional: {
    name: "Professional",
    price: "R$ 299/mês após o teste",
    detail: "Operação completa",
  },
  premium: {
    name: "Premium",
    price: "R$ 499/mês após o teste",
    detail: "Multiunidade",
  },
} as const;

export default function TrialSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    establishmentName: "",
    ownerName: "",
    ownerEmail: "",
    phone: "",
    password: "",
    branchName: "Matriz",
    planCode: "professional" as "starter" | "professional" | "premium",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      const trialInput = {
        establishmentName: form.establishmentName,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        password: form.password,
        branchName: form.branchName || "Matriz",
        planCode: form.planCode,
        ...(form.phone ? { phone: form.phone } : {}),
      };
      await startTrial(trialInput);
      setStatus("success");
      router.push("/app/onboarding");
      router.refresh();
    } catch (trialError) {
      const message =
        trialError instanceof ApiError && trialError.status === 400
          ? "Confira os dados informados. O nome do ambiente ou e-mail podem já estar em uso."
          : "Não foi possível criar seu teste grátis agora. Tente novamente em instantes.";
      setError(message);
      setStatus("idle");
    }
  }

  return (
    <main className="login-page trial-signup-page">
      <section className="login-art">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <div className="login-copy">
          <span className="eyebrow">Teste grátis de 7 dias</span>
          <h1>Crie o ambiente do seu estabelecimento.</h1>
          <p>
            Sem cartão na entrada. Você testa a operação real do GiroMesa e só ativa a cobrança se
            decidir continuar depois do período gratuito.
          </p>
        </div>
        <ul className="trial-checklist">
          {setupItems.map((item) => (
            <li key={item}>
              <Check size={16} /> {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="login-panel">
        <form className="form trial-form" onSubmit={handleSubmit}>
          <div>
            <span className="section-kicker">Comece sem cartão</span>
            <h2>Teste grátis GiroMesa</h2>
            <p>Preencha os dados para liberar seu painel inicial.</p>
          </div>

          <label className="field">
            <span>Nome do estabelecimento</span>
            <span className="input-shell">
              <Store size={18} />
              <input
                name="establishmentName"
                value={form.establishmentName}
                onChange={(event) => updateForm("establishmentName", event.target.value)}
                autoComplete="organization"
                placeholder="Ex.: Bar Aurora"
                required
              />
            </span>
          </label>

          <label className="field">
            <span>Seu nome</span>
            <span className="input-shell">
              <Store size={18} />
              <input
                name="ownerName"
                value={form.ownerName}
                onChange={(event) => updateForm("ownerName", event.target.value)}
                autoComplete="name"
                placeholder="Nome do responsável"
                required
              />
            </span>
          </label>

          <label className="field">
            <span>E-mail de acesso</span>
            <span className="input-shell">
              <Mail size={18} />
              <input
                name="ownerEmail"
                type="email"
                value={form.ownerEmail}
                onChange={(event) => updateForm("ownerEmail", event.target.value)}
                autoComplete="email"
                placeholder="voce@restaurante.com.br"
                required
              />
            </span>
          </label>

          <label className="field">
            <span>Telefone comercial</span>
            <span className="input-shell">
              <Phone size={18} />
              <input
                name="phone"
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value)}
                autoComplete="tel"
                placeholder="WhatsApp para contato"
              />
            </span>
          </label>

          <label className="field">
            <span>Senha</span>
            <span className="input-shell">
              <LockKeyhole size={18} />
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={(event) => updateForm("password", event.target.value)}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres com símbolo"
                required
              />
            </span>
          </label>

          <fieldset className="trial-plan-selector">
            <legend>Plano inicial</legend>
            {(["starter", "professional", "premium"] as const).map((plan) => (
              <button
                key={plan}
                type="button"
                className={form.planCode === plan ? "selected" : ""}
                onClick={() => updateForm("planCode", plan)}
              >
                <strong>{trialPlans[plan].name}</strong>
                <span>{trialPlans[plan].detail}</span>
                <small>{trialPlans[plan].price}</small>
              </button>
            ))}
          </fieldset>

          {error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="button primary full"
            type="submit"
            data-testid="trial-submit"
            disabled={!isHydrated || status !== "idle"}
          >
            {!isHydrated
              ? "Carregando cadastro..."
              : status === "loading"
                ? "Criando ambiente..."
                : "Começar teste grátis"}{" "}
            <ArrowRight size={18} />
          </button>
          <a className="button ghost full" href="/login">
            Já tenho conta
          </a>
          <aside className="trial-next-steps">
            <strong>Depois do cadastro</strong>
            {activationSteps.map((step, index) => (
              <span key={step}>
                {index + 1}. {step}
              </span>
            ))}
          </aside>
        </form>
      </section>
    </main>
  );
}
