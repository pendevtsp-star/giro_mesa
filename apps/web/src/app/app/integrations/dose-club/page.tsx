"use client";

import {
  ArrowLeft,
  Cable,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  ApiError,
  activateClubWhiskyIntegration,
  type ClubWhiskyIntegrationConfig,
  configureClubWhiskyIntegration,
  createDoseClubHandoff,
  getClubWhiskyConfig,
  getEcosystemEntitlements,
  getSession,
  recordClubWhiskyHealth,
  revokeClubWhiskyIntegration,
} from "../../../../lib/giromesa-api";
import {
  availableIntegrationLifecycleActions,
  integrationStateDetails,
} from "../../../../lib/integration-state";

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
  const [canAccessDoseClub, setCanAccessDoseClub] = useState(false);
  const integrationState = integrationStateDetails(config?.status);
  const lifecycleActions = availableIntegrationLifecycleActions(integrationState.state);

  useEffect(() => {
    let ignore = false;

    Promise.all([getClubWhiskyConfig(), getSession(), getEcosystemEntitlements()])
      .then(([integration, session, entitlements]) => {
        if (ignore) {
          return;
        }
        setConfig(integration);
        setCanAccessDoseClub(
          entitlements.includes("doseclub.subscription") || entitlements.includes("bundle"),
        );
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

  async function openDoseClub() {
    setIsBusy(true);
    try {
      const handoff = await createDoseClubHandoff("/");
      window.location.assign(handoff.targetUrl);
    } catch (error) {
      setStatus(readError(error, "Não foi possível iniciar o acesso ao Dose Club."));
      setIsBusy(false);
    }
  }

  async function transitionLifecycle(action: "activate" | "healthy" | "degraded" | "revoke") {
    if (config?.lifecycleVersion === undefined) return;
    const promptLabel =
      action === "activate"
        ? "Informe a evidência da homologação conjunta:"
        : action === "revoke"
          ? "Informe o motivo da revogação:"
          : "Informe o resultado verificável do health check:";
    const detail = window.prompt(promptLabel)?.trim();
    if (!detail) return;
    if (action === "revoke" && !window.confirm("A revogação bloqueia imediatamente o conector.")) {
      return;
    }
    setIsBusy(true);
    try {
      const next =
        action === "activate"
          ? await activateClubWhiskyIntegration({
              expectedVersion: config.lifecycleVersion,
              evidence: detail,
            })
          : action === "revoke"
            ? await revokeClubWhiskyIntegration({
                expectedVersion: config.lifecycleVersion,
                reason: detail,
              })
            : await recordClubWhiskyHealth({
                expectedVersion: config.lifecycleVersion,
                healthy: action === "healthy",
                detail,
              });
      setConfig((current) => ({ ...current, ...next }) as ClubWhiskyIntegrationConfig);
      setStatus(`Lifecycle atualizado para ${integrationStateDetails(next.status).label}.`);
    } catch (error) {
      setStatus(readError(error, "Não foi possível atualizar o lifecycle da integração."));
    } finally {
      setIsBusy(false);
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
              {integrationState.label}
            </span>
          </div>

          <div className="ticket-actions">
            {lifecycleActions.some((action) => action === "activate") ? (
              <button
                className="button primary"
                type="button"
                disabled={isBusy}
                onClick={() => void transitionLifecycle("activate")}
              >
                Aprovar homologação
              </button>
            ) : null}
            {lifecycleActions.some((action) => action === "health") ? (
              <>
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void transitionLifecycle("healthy")}
                >
                  Health aprovado
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void transitionLifecycle("degraded")}
                >
                  Marcar degradada
                </button>
              </>
            ) : null}
            {lifecycleActions.some((action) => action === "revoke") ? (
              <button
                className="button secondary"
                type="button"
                disabled={isBusy}
                onClick={() => void transitionLifecycle("revoke")}
              >
                Revogar integração
              </button>
            ) : null}
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

          {canAccessDoseClub ? (
            <button
              className="button primary"
              type="button"
              disabled={isBusy}
              onClick={() => void openDoseClub()}
            >
              <ExternalLink size={17} /> Acessar Dose Club
            </button>
          ) : (
            <a
              className="button secondary"
              href="https://doseclube.giromesa.com.br/?utm_source=giromesa_app&utm_medium=ecosystem"
            >
              <ExternalLink size={17} /> Conhecer Dose Club
            </a>
          )}

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
          <small>Responsável: {config?.owner ?? "Administrador do tenant"}</small>
          <small>Dependência: {config?.dependency ?? "Homologação Dose Club"}</small>
          <small>Contingência: {config?.contingency ?? integrationState.contingency}</small>
          <small>
            Lifecycle v{config?.lifecycleVersion ?? 0} · motivo {config?.lifecycleReason ?? "n/a"}
          </small>
          <small>Último health: {config?.lastHealthAt ?? "ainda não executado"}</small>
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
