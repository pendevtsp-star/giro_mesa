"use client";

import { ArrowRight, Eye, EyeOff, LifeBuoy, LockKeyhole, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import {
  ApiError,
  apiBaseUrl,
  completeGoogleMfa,
  login,
  requestPasswordReset,
} from "../../lib/giromesa-api";
import { useTranslation } from "../../lib/i18n";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageSkeleton />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageSkeleton() {
  const { locale, setLocale, t } = useTranslation();
  return (
    <main className="login-page login-page-night">
      <section className="login-art">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
      </section>
      <section className="login-panel">
        <form className="form">
          <div>
            <span className="section-kicker">{t("auth.secureAccess")}</span>
            <h2>{t("auth.loginTitle")}</h2>
            <p>{t("auth.loadingAccess")}</p>
          </div>
        </form>
      </section>
    </main>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, setLocale, t } = useTranslation();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState(searchParams.get("password") ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [oauthChallenge, setOauthChallenge] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [feedback, setFeedback] = useState<{
    kind: "error" | "info" | "success";
    message: string;
    actionHref?: string;
  } | null>(null);
  const [resetStatus, setResetStatus] = useState<"idle" | "loading">("idle");
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
      setFeedback({ kind: "info", message: t("auth.mfaCompleteGoogle") });
      return;
    }

    if (oauthStatus === "google_sign_in_failed") {
      setFeedback({ kind: "error", message: t("auth.googleLoginFailed") });
    }
  }, [searchParams, t]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setFeedback(null);

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
        setFeedback({ kind: "info", message: t("auth.mfaRequired") });
        setStatus("idle");
        return;
      }

      setStatus("success");
      router.push(result.user.isPlatformUser ? "/platform" : "/app");
      router.refresh();
    } catch (loginError) {
      let message = t("loginErrors.generic");

      if (loginError instanceof ApiError) {
        if (loginError.status === 401) {
          message = t("loginErrors.invalidCredentials");
        } else if (loginError.status === 403) {
          message = t("loginErrors.accessDenied");
        } else if (loginError.status === 429) {
          message = t("loginErrors.rateLimited");
        } else if (loginError.status === 503) {
          message = t("loginErrors.serverUnavailable");
        } else if (loginError.message) {
          message = loginError.message;
        }
      } else if (loginError instanceof TypeError && loginError.message.includes("fetch")) {
        message = t("loginErrors.connectionFailed");
      }

      setFeedback({ kind: "error", message });
      setStatus("idle");
    }
  }

  async function handleResetPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFeedback({ kind: "error", message: t("auth.resetPasswordEmailRequired") });
      return;
    }

    setFeedback(null);
    setResetStatus("loading");
    try {
      const reset = await requestPasswordReset(normalizedEmail);
      let actionHref: string | undefined;
      if (reset.resetUrl) {
        try {
          actionHref = new URL(reset.resetUrl, window.location.origin).pathname;
        } catch {
          actionHref = undefined;
        }
      }
      setFeedback({
        kind: "success",
        message: t("auth.resetPasswordEmail"),
        ...(actionHref ? { actionHref } : {}),
      });
    } catch (resetError) {
      const message =
        resetError instanceof ApiError && resetError.status === 429
          ? t("loginErrors.rateLimited")
          : resetError instanceof TypeError && resetError.message.includes("fetch")
            ? t("loginErrors.connectionFailed")
            : t("auth.resetPasswordError");
      setFeedback({ kind: "error", message });
    } finally {
      setResetStatus("idle");
    }
  }

  return (
    <main className="login-page login-page-night">
      <section className="login-art">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
        <div className="login-copy">
          <span className="eyebrow">{t("auth.secureAccess")}</span>
          <h1>{t("trial.sevenDayTrial")}</h1>
          <p>{t("trial.trialDescription")}</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="form" onSubmit={handleSubmit}>
          <div>
            <span className="section-kicker">{t("auth.login")}</span>
            <h2>{t("auth.loginTitle")}</h2>
            <p>{t("auth.loginSubtitle")}</p>
          </div>
          <label className="field">
            <span>{t("auth.email")}</span>
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
            <span>{t("auth.password")}</span>
            <span className="input-shell">
              <LockKeyhole size={18} />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>{t("auth.rememberMe")}</span>
          </label>
          {mfaRequired ? (
            <label className="field">
              <span>{t("auth.mfaCode")}</span>
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
          {feedback ? (
            <p
              className={`form-alert form-alert-${feedback.kind}`}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              <span>{feedback.message}</span>
              {feedback.actionHref ? (
                <a className="form-alert-action" href={feedback.actionHref}>
                  {t("auth.resetPasswordLink")}
                </a>
              ) : null}
            </p>
          ) : null}
          <button
            className="button primary full"
            type="submit"
            data-testid="login-submit"
            disabled={!isHydrated || status === "loading" || status === "success"}
          >
            {!isHydrated
              ? t("auth.loadingAccess")
              : status === "loading"
                ? t("auth.signInLoading")
                : t("auth.signIn")}{" "}
            <ArrowRight size={18} />
          </button>
          <a
            className="button secondary full"
            href={`${apiBaseUrl}/api/v1/auth/google/start?returnTo=${encodeURIComponent("/app")}`}
          >
            <span>{oauthChallenge ? t("auth.mfaResume") : t("auth.signInWithGoogle")}</span>
          </a>
          <a className="button secondary full" href="/suporte">
            <LifeBuoy size={18} /> {t("buttons.support")}
          </a>
          <button
            className="button ghost full"
            id="recuperar-senha"
            type="button"
            onClick={handleResetPassword}
            disabled={resetStatus === "loading"}
          >
            {resetStatus === "loading" ? t("auth.resetPasswordLoading") : t("auth.forgotPassword")}
          </button>
          <a className="button ghost full" href="/teste-gratis">
            {t("trial.startFreeTrial")}
          </a>
        </form>
      </section>
    </main>
  );
}
