"use client";

import { ArrowRight, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, acceptInvitation } from "../../../lib/giromesa-api";

export default function AcceptInvitationPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      await acceptInvitation({
        token,
        ...(name.trim() ? { name: name.trim() } : {}),
        password,
      });
      setStatus("success");
      router.push("/app");
      router.refresh();
    } catch (acceptError) {
      const message =
        acceptError instanceof ApiError && acceptError.status === 401
          ? "Convite invalido, expirado ou ja utilizado."
          : "Não foi possivel aceitar o convite agora.";
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
          <span className="eyebrow">Convite de equipe</span>
          <h1>Finalize seu acesso.</h1>
          <p>Defina sua senha inicial para entrar no painel operacional do estabelecimento.</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="form" onSubmit={handleSubmit}>
          <div>
            <span className="section-kicker">Primeiro acesso</span>
            <h2>Aceitar convite</h2>
            <p>O link so pode ser utilizado uma vez e expira automaticamente.</p>
          </div>
          <label className="field">
            <span>Nome</span>
            <span className="input-shell">
              <UserRound size={18} />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Seu nome"
              />
            </span>
          </label>
          <label className="field">
            <span>Senha inicial</span>
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
            {status === "loading" ? "Criando acesso..." : "Entrar no GiroMesa"}{" "}
            <ArrowRight size={18} />
          </button>
          <a className="button secondary full" href="/login">
            <Mail size={18} /> Ja tenho acesso
          </a>
        </form>
      </section>
    </main>
  );
}
