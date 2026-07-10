"use client";

import { ArrowRight, LifeBuoy, LockKeyhole, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ApiError,
  apiBaseUrl,
  completeGoogleMfa,
  login,
  requestPasswordReset,
} from "../../lib/giromesa-api";

const accessModes = {
  restaurant: {
    label: "Restaurante",
    eyebrow: "Bar Aurora Demo",
    title: "Entre no painel da operação.",
    description: "Use o ambiente demo para navegar por salao, PDV, cozinha, estoque e caixa.",
    email: "admin@bar-aurora-demo.local",
    password: "Demo@12345",
  },
  platform: {
    label: "Dono SaaS",
    eyebrow: "GiroMesa Platform",
    title: "Entre no backoffice SaaS.",
    description: "Controle tenants, trials, planos, status e onboarding dos clientes.",
    email: "owner@giromesa.local",
    password: "Platform@12345",
  },
} as const;

type AccessMode = keyof typeof accessModes;

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageSkeleton />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageSkeleton() {
  return (
    <main className="login-page">
      <section className="login-art">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </section>
      <section className="login-panel">
        <form className="form">
          <div>
            <span className="section-kicker">Acesso demo</span>
            <h2>Acessar GiroMesa</h2>
            <p>Carregando ambiente de acesso...</p>
          </div>
        </form>
      </section>
    </main>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accessMode, setAccessMode] = useState<AccessMode>("restaurant");
  const [email, setEmail] = useState<string>(accessModes.restaurant.email);
  const [password, setPassword] = useState<string>(accessModes.restaurant.password);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [oauthChallenge, setOauthChallenge] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    const challenge = searchParams.get("challenge");
    if (challenge) {
      setOauthChallenge(challenge);
      setMfaRequired(true);
      setError("Conclua o MFA para finalizar o acesso com Google.");
      return;
    }

    if (oauthStatus === "google_sign_in_failed") {
      setError("Nao foi possivel concluir o login com Google.");
    }
  }, [searchParams]);

  function selectAccessMode(mode: AccessMode) {
    setAccessMode(mode);
    setEmail(accessModes[mode].email);
    setPassword(accessModes[mode].password);
    setMfaCode("");
    setMfaRequired(false);
    setOauthChallenge(null);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      if (oauthChallenge) {
        const result = await completeGoogleMfa({
          challengeToken: oauthChallenge,
          code: mfaCode,
        });
        setStatus("success");
        window.location.href = result.redirectTo;
        router.refresh();
        return;
      }

      const result = await login(email, password, mfaCode);
      if (result.session.mfaRequired) {
        setMfaRequired(true);
        setError("Informe o codigo do autenticador para concluir o acesso.");
        setStatus("idle");
        return;
      }

      setStatus("success");
      router.push(result.user.isPlatformUser ? "/platform" : "/app");
      router.refresh();
    } catch (loginError) {
      const message =
        loginError instanceof ApiError && loginError.status === 401
          ? "Credenciais invalidas para o ambiente demo."
          : "Nao foi possivel conectar na API local agora.";
      setError(message);
      setStatus("idle");
    }
  }

  async function handleResetPassword() {
    setError(null);
    try {
      const reset = await requestPasswordReset(email);
      setError(
        reset.resetUrl
          ? `Reset mock criado: ${reset.resetUrl}`
          : "Solicitacao de reset registrada. Envio mock anotado na auditoria.",
      );
    } catch {
      setError("Nao foi possivel solicitar reset agora.");
    }
  }

  return (
    <main className="login-page">
      <section className="login-art">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <div className="login-copy">
          <span className="eyebrow">{accessModes[accessMode].eyebrow}</span>
          <h1>{accessModes[accessMode].title}</h1>
          <p>{accessModes[accessMode].description}</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="form" onSubmit={handleSubmit}>
          <div>
            <span className="section-kicker">Acesso demo</span>
            <h2>Acessar GiroMesa</h2>
            <p>Escolha se quer entrar como restaurante ou como dono da plataforma.</p>
          </div>
          <fieldset className="login-mode-grid">
            <legend>Tipo de acesso</legend>
            {(Object.keys(accessModes) as AccessMode[]).map((mode) => (
              <button
                className={`login-mode ${accessMode === mode ? "selected" : ""}`}
                type="button"
                key={mode}
                onClick={() => selectAccessMode(mode)}
              >
                <strong>{accessModes[mode].label}</strong>
                <span>{mode === "platform" ? "Backoffice SaaS" : "Operação do cliente"}</span>
              </button>
            ))}
          </fieldset>
          <label className="field">
            <span>E-mail</span>
            <span className="input-shell">
              <Mail size={18} />
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </span>
          </label>
          <label className="field">
            <span>Senha</span>
            <span className="input-shell">
              <LockKeyhole size={18} />
              <input
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </span>
          </label>
          {mfaRequired ? (
            <label className="field">
              <span>Codigo MFA</span>
              <span className="input-shell">
                <LockKeyhole size={18} />
                <input
                  inputMode="numeric"
                  name="mfaCode"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
              </span>
            </label>
          ) : null}
          {error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button primary full"
            type="submit"
            data-testid="login-submit"
            disabled={!isHydrated || status === "loading" || status === "success"}
          >
            {!isHydrated
              ? "Carregando acesso..."
              : status === "loading"
                ? "Entrando..."
                : "Entrar no painel"}{" "}
            <ArrowRight size={18} />
          </button>
          <a
            className="button secondary full"
            href={`${apiBaseUrl}/api/v1/auth/google/start?returnTo=${encodeURIComponent(
              accessMode === "platform" ? "/platform" : "/app",
            )}`}
          >
            <span>{oauthChallenge ? "Retomar Google apos MFA" : "Entrar com Google"}</span>
          </a>
          <a className="button secondary full" href="mailto:suporte@example.com">
            <LifeBuoy size={18} /> Suporte
          </a>
          <button className="button ghost full" type="button" onClick={handleResetPassword}>
            Solicitar reset de senha
          </button>
        </form>
      </section>
    </main>
  );
}
