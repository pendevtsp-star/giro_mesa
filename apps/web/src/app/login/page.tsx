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
      setError(t("auth.mfaCompleteGoogle"));
      return;
    }

    if (oauthStatus === "google_sign_in_failed") {
      setError(t("auth.googleLoginFailed"));
    }
  }, [searchParams, t]);

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
        setError(t("auth.mfaRequired"));
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
          ? `${t("auth.resetPasswordLink")}: ${reset.resetUrl}`
          : t("auth.resetPasswordEmail"),
      );
    } catch {
      setError(t("auth.resetPasswordError"));
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
          <a className="button secondary full" href="mailto:suporte@example.com">
            <LifeBuoy size={18} /> {t("buttons.support")}
          </a>
          <button className="button ghost full" type="button" onClick={handleResetPassword}>
            {t("auth.forgotPassword")}
          </button>
          <a className="button ghost full" href="/teste-gratis">
            {t("trial.startFreeTrial")}
          </a>
        </form>
      </section>
    </main>
  );
}
