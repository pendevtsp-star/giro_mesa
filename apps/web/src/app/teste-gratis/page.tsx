"use client";

import { ArrowRight, Check, LockKeyhole, Mail, Phone, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { ApiError, startTrial } from "../../lib/giromesa-api";
import { useTranslation } from "../../lib/i18n";

export default function TrialSignupPage() {
  const router = useRouter();
  const { locale, setLocale, t, tArray } = useTranslation();
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

  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get("plan");
    if (plan === "starter" || plan === "professional" || plan === "premium") {
      setForm((current) => ({ ...current, planCode: plan }));
    }
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
          ? t("trial.dataConflict")
          : trialError instanceof ApiError && trialError.status === 403
            ? "O programa piloto está disponível por convite. Solicite acesso à equipe GiroMesa."
            : t("trial.afterSignupError");
      setError(message);
      setStatus("idle");
    }
  }

  const setupItems = tArray("trial.setupItems");
  const activationSteps = tArray("trial.activationSteps");

  const trialPlans = {
    starter: {
      name: t("plans.starter.name"),
      price: t("plans.starter.trialPrice"),
      detail: t("plans.starter.trialDetail"),
    },
    professional: {
      name: t("plans.professional.name"),
      price: t("plans.professional.trialPrice"),
      detail: t("plans.professional.trialDetail"),
    },
    premium: {
      name: t("plans.premium.name"),
      price: t("plans.premium.trialPrice"),
      detail: t("plans.premium.trialDetail"),
    },
  };

  return (
    <main className="login-page trial-signup-page">
      <section className="login-art">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
        <div className="login-copy">
          <span className="eyebrow">{t("trial.sevenDayTrial")}</span>
          <h1>{t("trial.startWithoutCard")}</h1>
          <p>{t("trial.trialDescription")}</p>
        </div>
        <ul className="trial-checklist">
          {setupItems.map((item: string) => (
            <li key={item}>
              <Check size={16} /> {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="login-panel">
        <form className="form trial-form" onSubmit={handleSubmit}>
          <div>
            <span className="section-kicker">{t("trial.startWithoutCard")}</span>
            <h2>{t("trial.trialTitle")}</h2>
            <p>{t("trial.trialSubtitle")}</p>
          </div>

          <label className="field">
            <span>{t("trial.establishmentName")}</span>
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
            <span>{t("trial.ownerName")}</span>
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
            <span>{t("trial.ownerEmail")}</span>
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
            <span>{t("trial.phone")}</span>
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
            <span>{t("auth.password")}</span>
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
            <legend>{t("trial.initialPlan")}</legend>
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
              ? t("trial.loadingSignup")
              : status === "loading"
                ? t("trial.creatingEnvironment")
                : t("trial.startFreeTrial")}{" "}
            <ArrowRight size={18} />
          </button>
          <a className="button ghost full" href="/login">
            {t("trial.alreadyHaveAccount")}
          </a>
          <aside className="trial-next-steps">
            <strong>{t("trial.afterSignup")}</strong>
            {activationSteps.map((step: string, index: number) => (
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
