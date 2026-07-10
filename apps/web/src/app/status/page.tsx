"use client";

import { Activity, ArrowLeft, CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Health = { status: "ok"; service: string; timestamp: string };

export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const check = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/health", { cache: "no-store" });
      if (!response.ok) throw new Error("health unavailable");
      setHealth(await response.json());
      setError(false);
    } catch {
      setHealth(null);
      setError(true);
    } finally {
      setCheckedAt(new Date());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);
  const healthy = Boolean(health && !error);

  return (
    <main className="status-page">
      <a className="brand" href="/">
        <span className="brand-mark">G</span>
        <span>GiroMesa</span>
      </a>
      <section className="status-card">
        <span className={healthy ? "status-icon healthy" : "status-icon issue"}>
          {healthy ? <CheckCircle2 size={28} /> : <CircleAlert size={28} />}
        </span>
        <span className="section-kicker">Status da plataforma</span>
        <h1>
          {loading
            ? "Verificando serviços"
            : healthy
              ? "Serviços operando normalmente"
              : "Verificação indisponível"}
        </h1>
        <p>
          {healthy
            ? "A API do GiroMesa respondeu à última verificação."
            : "Não foi possível confirmar a API neste momento. Tente novamente em alguns instantes."}
        </p>
        <div className="status-details">
          <Activity size={17} />
          <span>API</span>
          <strong>{healthy ? "operacional" : "atenção"}</strong>
        </div>
        <div className="status-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => void check()}
            disabled={loading}
          >
            <RefreshCw size={16} /> Verificar novamente
          </button>
          <a className="button secondary" href="/">
            <ArrowLeft size={16} /> Voltar ao site
          </a>
        </div>
        {checkedAt ? <small>Última verificação: {checkedAt.toLocaleString("pt-BR")}</small> : null}
      </section>
    </main>
  );
}
