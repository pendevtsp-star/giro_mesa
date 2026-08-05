"use client";

import { useEffect, useState } from "react";
import { PublicLegalPage } from "../../components/PublicLegalPage";
import { createCommercialInterest } from "../../lib/giromesa-api";

type PlanCode = "starter" | "professional" | "premium";

export default function ContactPage() {
  const [planCode, setPlanCode] = useState<PlanCode | undefined>();
  const [origin, setOrigin] = useState("contact");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPlan = params.get("plan");
    if (
      requestedPlan === "starter" ||
      requestedPlan === "professional" ||
      requestedPlan === "premium"
    ) {
      setPlanCode(requestedPlan);
    }
    const requestedOrigin = params.get("origin");
    if (requestedOrigin && /^[a-z0-9_-]{2,80}$/.test(requestedOrigin)) {
      setOrigin(requestedOrigin);
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();

    try {
      await createCommercialInterest({
        product: "giromesa",
        ...(planCode ? { planCode } : {}),
        origin,
        establishmentName: String(form.get("establishmentName") ?? ""),
        contactName: String(form.get("contactName") ?? ""),
        email: String(form.get("email") ?? ""),
        ...(phone ? { phone } : {}),
        ...(message ? { message } : {}),
      });
      setStatus("sent");
    } catch {
      setError("Não foi possível registrar o interesse agora. Tente novamente em instantes.");
      setStatus("idle");
    }
  }

  return (
    <PublicLegalPage title="Programa piloto" summary="Solicite uma implantação acompanhada.">
      {status === "sent" ? (
        <section className="legal-pending" role="status">
          <strong>Interesse registrado.</strong>
          <p>A equipe GiroMesa poderá usar os dados informados para retornar sobre o piloto.</p>
        </section>
      ) : (
        <form className="form" onSubmit={submit}>
          <p>
            Produto: <strong>GiroMesa</strong>
            {planCode ? ` · Plano de interesse: ${planCode}` : ""}
          </p>
          <label className="field">
            <span>Estabelecimento</span>
            <input name="establishmentName" required minLength={2} maxLength={160} />
          </label>
          <label className="field">
            <span>Seu nome</span>
            <input name="contactName" required minLength={2} maxLength={160} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input name="email" type="email" required />
          </label>
          <label className="field">
            <span>Telefone</span>
            <input name="phone" type="tel" minLength={8} maxLength={32} />
          </label>
          <label className="field">
            <span>Como podemos ajudar?</span>
            <textarea name="message" maxLength={1000} rows={4} />
          </label>
          {error ? <p className="error-box">{error}</p> : null}
          <button className="button primary" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Enviando..." : "Solicitar acesso ao piloto"}
          </button>
        </form>
      )}
    </PublicLegalPage>
  );
}
