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
            <span className="section-kicker">Acesso seguro</span>
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
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState(searchParams.get("password") ?? "");
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
      setError("Não foi possível concluir o login com Google.");
    }
  }, [searchParams]);

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
        setError("Informe o código do autenticador para concluir o acesso.");
        setStatus("idle");
        return;
      }

      setStatus("success");
      router.push(result.user.isPlatformUser ? "/platform" : "/app");
      router.refresh();
    } catch (loginError) {
      const message =
        loginError instanceof ApiError && loginError.status === 401
          ? "E-mail ou senha inválidos."
          : "Não foi possível acessar o GiroMesa agora. Tente novamente em instantes.";
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
          ? `Link de reset preparado: ${reset.resetUrl}`
          : "Solicitação registrada. Se o e-mail existir, enviaremos as instruções de recuperação.",
      );
    } catch {
      setError("Não foi possível solicitar o reset agora. Tente novamente em instantes.");
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
          <span className="eyebrow">Acesso seguro</span>
          <h1>Entre no seu ambiente GiroMesa.</h1>
          <p>
            Use suas credenciais para acessar a operação do estabelecimento ou o backoffice da
            plataforma.
          </p>
        </div>
      </section>
      <section className="login-panel">
        <form className="form" onSubmit={handleSubmit}>
          <div>
            <span className="section-kicker">Login</span>
            <h2>Acessar GiroMesa</h2>
            <p>Informe seu e-mail e senha para continuar.</p>
          </div>
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
                required
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
                required
              />
            </span>
          </label>
          {mfaRequired ? (
            <label className="field">
              <span>Código MFA</span>
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
            href={`${apiBaseUrl}/api/v1/auth/google/start?returnTo=${encodeURIComponent("/app")}`}
          >
            <span>{oauthChallenge ? "Retomar Google após MFA" : "Entrar com Google"}</span>
          </a>
          <a className="button secondary full" href="mailto:suporte@example.com">
            <LifeBuoy size={18} /> Suporte
          </a>
          <button className="button ghost full" type="button" onClick={handleResetPassword}>
            Solicitar reset de senha
          </button>
          <a className="button ghost full" href="/teste-gratis">
            Começar teste grátis
          </a>
        </form>
      </section>
    </main>
  );
}
