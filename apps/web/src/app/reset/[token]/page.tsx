"use client";

import { ArrowRight, LockKeyhole, MailCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, resetPassword } from "../../../lib/giromesa-api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      await resetPassword({ token, password });
      setStatus("success");
      router.push("/login");
      router.refresh();
    } catch (resetError) {
      const message =
        resetError instanceof ApiError && resetError.status === 401
          ? "Link invalido, expirado ou ja utilizado."
          : "Nao foi possivel redefinir a senha agora.";
      setError(message);
      setStatus("idle");
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
          <span className="eyebrow">Recuperacao de acesso</span>
          <h1>Defina uma nova senha.</h1>
          <p>O link de reset e temporario e fica registrado na auditoria do estabelecimento.</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="form" onSubmit={handleSubmit}>
          <div>
            <span className="section-kicker">Reset de senha</span>
            <h2>Nova senha</h2>
            <p>Use pelo menos 8 caracteres com maiuscula, minuscula, numero e simbolo.</p>
          </div>
          <label className="field">
            <span>Senha</span>
            <span className="input-shell">
              <LockKeyhole size={18} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </span>
          </label>
          {error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button primary full"
            type="submit"
            disabled={status === "loading" || status === "success" || password.length < 8}
          >
            {status === "loading" ? "Atualizando..." : "Redefinir senha"} <ArrowRight size={18} />
          </button>
          <a className="button secondary full" href="/login">
            <MailCheck size={18} /> Voltar ao login
          </a>
        </form>
      </section>
    </main>
  );
}
