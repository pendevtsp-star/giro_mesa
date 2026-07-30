"use client";

import { ArrowLeft, Cable, CheckCircle2, Copy, KeyRound, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ApiError,
  type ClubWhiskyIntegrationConfig,
  configureClubWhiskyIntegration,
  getClubWhiskyConfig,
  getSession,
} from "../../../../lib/giromesa-api";

type IntegrationForm = {
  branchId: string;
  remoteClientId: string;
  webhookUrl: string;
};

const emptyForm: IntegrationForm = {
  branchId: "",
  remoteClientId: "",
  webhookUrl: "https://doseclube.giromesa.com.br/v1/webhooks/giromesa",
};

export default function DoseClubIntegrationPage() {
  const [config, setConfig] = useState<ClubWhiskyIntegrationConfig | null>(null);
  const [form, setForm] = useState<IntegrationForm>(emptyForm);
  const [issuedApiKey, setIssuedApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState("Carregando configuração.");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let ignore = false;

    Promise.all([getClubWhiskyConfig(), getSession()])
      .then(([integration, session]) => {
        if (ignore) {
          return;
        }
        setConfig(integration);
        setForm({
          branchId: integration.branchId ?? session.branchId ?? "",
          remoteClientId: integration.remoteClientId ?? "",
          webhookUrl:
            integration.webhookUrl ?? "https://doseclube.giromesa.com.br/v1/webhooks/giromesa",
        });
        setStatus(
          integration.status === "not_configured"
            ? "Preencha os dados fornecidos pelo Dose Club para iniciar o pareamento."
            : "Configuração carregada. O estoque físico permanece sob autoridade do GiroMesa.",
        );
      })
      .catch((error) => {
        if (!ignore) {
          setStatus(readError(error, "Não foi possível carregar a integração."));
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function save(rotateKey: boolean) {
    if (!form.branchId || !form.remoteClientId || !form.webhookUrl) {
      setStatus("Informe filial, client ID remoto e URL do webhook.");
      return;
    }

    if (
      rotateKey &&
      !window.confirm("Rotacionar a chave invalida imediatamente a chave anterior.")
    ) {
      return;
    }

    setIsBusy(true);
    setIssuedApiKey(null);
    try {
      const response = await configureClubWhiskyIntegration({
        branchId: form.branchId,
        remoteClientId: form.remoteClientId,
        webhookUrl: form.webhookUrl,
        rotateKey,
      });
      setConfig(response);
      setIssuedApiKey(response.apiKey ?? null);
      setStatus(
        response.apiKey
          ? "Configuração salva. Copie a chave agora: ela não será exibida novamente."
          : "Configuração salva sem alterar a chave de acesso.",
      );
    } catch (error) {
      setStatus(readError(error, "Não foi possível salvar a integração."));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyIssuedKey() {
    if (!issuedApiKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(issuedApiKey);
      setStatus("Chave copiada. Guarde-a no secret manager do Dose Club.");
    } catch {
      setStatus("Não foi possível copiar automaticamente. Selecione a chave e copie manualmente.");
    }
  }

  return (
    <main className="branding-page">
      <header className="branding-page-header">
        <a className="button secondary" href="/app">
          <ArrowLeft size={17} /> Voltar
        </a>
        <div>
          <span className="section-kicker">Integrações</span>
          <h1>Dose Club</h1>
          <p>
            Conecte os dois produtos sem compartilhar banco. O GiroMesa controla o estoque físico; o
            Dose Club controla clubes, combos e saldos de doses.
          </p>
        </div>
      </header>

      <section className="branding-settings-layout">
        <article className="panel branding-settings-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Pareamento</span>
              <h2>Canal entre os produtos</h2>
            </div>
            <Cable size={20} />
          </div>

          <form
            className="branding-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save(false);
            }}
          >
            <label>
              Filial GiroMesa
              <input
                value={form.branchId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, branchId: event.target.value }))
                }
                placeholder="UUID da filial"
                autoComplete="off"
              />
            </label>
            <label>
              Client ID criado no Dose Club
              <input
                value={form.remoteClientId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, remoteClientId: event.target.value }))
                }
                placeholder="Ex.: giromesa-bar-aurora"
                autoComplete="off"
              />
            </label>
            <label>
              Webhook do Dose Club
              <input
                type="url"
                value={form.webhookUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, webhookUrl: event.target.value }))
                }
                placeholder="https://doseclube.giromesa.com.br/v1/webhooks/giromesa"
                autoComplete="off"
              />
            </label>

            <div className="ticket-actions">
              <button className="button primary" type="submit" disabled={isBusy}>
                <CheckCircle2 size={17} /> Salvar pareamento
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={isBusy || !config?.hasApiKey}
                onClick={() => void save(true)}
              >
                <RefreshCw size={17} /> Rotacionar chave
              </button>
            </div>
          </form>
        </article>

        <aside className="panel branding-preview-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Estado</span>
              <h2>
                {config?.status === "active" ? "Integração configurada" : "Aguardando configuração"}
              </h2>
            </div>
            <span
              className={`gm-badge ${config?.status === "active" ? "gm-badge-good" : "gm-badge-warn"}`}
            >
              {config?.status ?? "carregando"}
            </span>
          </div>

          <div className="billing-steps">
            <div>
              <CheckCircle2 size={18} />
              <span>Compra de clube ou combo não movimenta estoque.</span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>Cada dose baixa o rótulo efetivamente servido em mililitros.</span>
            </div>
            <div>
              <KeyRound size={18} />
              <span>
                Chave atual:{" "}
                {config?.hasApiKey ? `final ${config.apiKeyLastFour}` : "ainda não emitida"}
              </span>
            </div>
          </div>

          {issuedApiKey ? (
            <div className="panel">
              <span className="section-kicker">Exibição única</span>
              <h3>Chave para o Dose Club</h3>
              <input value={issuedApiKey} readOnly aria-label="Chave de integração emitida" />
              <button
                className="button secondary"
                type="button"
                onClick={() => void copyIssuedKey()}
              >
                <Copy size={16} /> Copiar chave
              </button>
            </div>
          ) : null}

          <p className="muted-copy" role="status">
            {status}
          </p>
          <small>
            Contrato {config?.contractVersion ?? "2026-07-30"} · autoridade de estoque{" "}
            {config?.inventoryAuthority ?? "giromesa"}
          </small>
        </aside>
      </section>
    </main>
  );
}

function readError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 401) {
    return "Entre novamente para configurar a integração.";
  }
  return error instanceof Error ? error.message : fallback;
}
