"use client";

import { Dialog } from "@giromesa/ui";
import {
  Building2,
  CheckCircle2,
  FileCheck2,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelFiscalDocument,
  disableFiscalProduction,
  enableFiscalProduction,
  type FiscalDocument,
  type FiscalOnboarding,
  getFiscalOnboarding,
  getSession,
  inviteFiscalAccountant,
  listFiscalDocuments,
  registerFiscalSimulator,
  retryFiscalDocument,
  revokeFiscalAccountantInvitation,
  revokeFiscalCredential,
  runFiscalHomologation,
  saveFiscalCredential,
  startFiscalOnboarding,
  updateFiscalCompany,
  updateFiscalTaxProfile,
  uploadFiscalCertificate,
} from "../../../lib/giromesa-api";
import styles from "./fiscal.module.css";

const steps = [
  ["company_data", "Empresa", "Dados cadastrais da filial"],
  ["accountant_review", "Contador", "Revisão tributária assistida"],
  ["provider_validation", "Integração", "Validação segura do emissor"],
  ["homologation", "Teste", "Cenários antes da produção"],
  ["ready_for_production", "Pronto", "Liberação com MFA"],
] as const;

const initialCompany = {
  legalName: "",
  tradeName: "",
  document: "",
  stateRegistration: "",
  municipalRegistration: "",
  taxRegime: "",
  uf: "",
  cityCode: "",
  cityName: "",
};

export default function FiscalPage() {
  const [branchId, setBranchId] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [onboarding, setOnboarding] = useState<FiscalOnboarding | null>(null);
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [notice, setNotice] = useState("Preparando a área fiscal...");
  const [busy, setBusy] = useState(false);
  const [accountantEmail, setAccountantEmail] = useState("");
  const [company, setCompany] = useState(initialCompany);
  const [taxReview, setTaxReview] = useState({
    series: "",
    model: "" as "" | "nfce" | "nfe" | "nfse",
    confirmed: false,
  });
  const [credential, setCredential] = useState({
    environment: "homologation" as "homologation" | "production",
    token: "",
  });
  const [certificate, setCertificate] = useState<{ file: File | null; password: string }>({
    file: null,
    password: "",
  });
  const [production, setProduction] = useState({ reason: "", mfaCode: "" });
  const [canceling, setCanceling] = useState<{ documentId: string; reason: string } | null>(null);

  const hasPermission = useCallback(
    (permission: string) => permissions.includes("*") || permissions.includes(permission),
    [permissions],
  );
  const canConfigure = hasPermission("fiscal:configure");
  const canManage = hasPermission("fiscal:manage");
  const canActivate = hasPermission("fiscal:activate_production");

  const refresh = useCallback(async (activeBranchId: string) => {
    if (!activeBranchId) return;
    const [flow, rows] = await Promise.all([
      getFiscalOnboarding(activeBranchId),
      listFiscalDocuments(activeBranchId),
    ]);
    setOnboarding(flow);
    setDocuments(rows);
    if (flow.settings) {
      setCompany({
        legalName: flow.settings.legalName ?? "",
        tradeName: flow.settings.tradeName ?? "",
        document: flow.settings.document ?? "",
        stateRegistration: flow.settings.stateRegistration ?? "",
        municipalRegistration: flow.settings.municipalRegistration ?? "",
        taxRegime:
          flow.settings.taxRegime === "unconfigured" ? "" : (flow.settings.taxRegime ?? ""),
        uf: flow.settings.uf ?? "",
        cityCode: flow.settings.cityCode ?? "",
        cityName: flow.settings.cityName ?? "",
      });
      const reviewCompleted = !["company_data", "accountant_review", "action_required"].includes(
        flow.status,
      );
      setTaxReview((current) => ({
        ...current,
        series: reviewCompleted ? (flow.settings?.series ?? "") : "",
        model: reviewCompleted ? (flow.settings?.defaultModel ?? "") : "",
      }));
    }
    setNotice("Configuração fiscal atualizada.");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error("Selecione uma filial");
        setPermissions(session.permissions);
        setBranchId(session.branchId);
        await refresh(session.branchId);
      } catch {
        setNotice("Entre com uma conta autorizada para acessar a área fiscal.");
      }
    })();
  }, [refresh]);

  const progress = useMemo(() => {
    if (!onboarding || ["not_started", "action_required"].includes(onboarding.status)) return 0;
    const index = steps.findIndex(([status]) => status === onboarding.status);
    return Math.max(index + 1, 0);
  }, [onboarding]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      await refresh(branchId);
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível concluir esta etapa.");
    } finally {
      setBusy(false);
    }
  }

  function safeRefresh() {
    if (!branchId) return;
    void run(async () => refresh(branchId), "Configuração fiscal atualizada.");
  }

  function saveCompany(event: FormEvent) {
    event.preventDefault();
    if (!onboarding?.settings || !canConfigure) return;
    void run(
      () =>
        updateFiscalCompany({
          branchId,
          ...company,
          expectedVersion: onboarding.settings?.version ?? 1,
        }),
      "Dados da empresa salvos. Solicite a revisão tributária antes de homologar.",
    );
  }

  function prepareSimulator() {
    if (!onboarding?.settings || !taxReview.confirmed || !taxReview.series || !taxReview.model) {
      setNotice("Confirme a revisão tributária, a série e o modelo fiscal antes de continuar.");
      return;
    }
    void run(async () => {
      await updateFiscalTaxProfile({
        branchId,
        expectedVersion: onboarding.settings?.version ?? 1,
        series: taxReview.series,
        defaultModel: taxReview.model as "nfce" | "nfe" | "nfse",
        defaults: { accountantReviewConfirmed: true, confirmedAt: new Date().toISOString() },
      });
      await registerFiscalSimulator(branchId);
    }, "Revisão registrada e simulador preparado.");
  }

  function homologate() {
    void run(async () => {
      const result = await runFiscalHomologation(branchId);
      if (!result.allPassed)
        throw new Error("A homologação encontrou cenários pendentes. Revise antes de avançar.");
    }, "Todos os cenários locais foram aprovados.");
  }

  async function sendCertificate(event: FormEvent) {
    event.preventDefault();
    if (!certificate.file || certificate.file.size > 10 * 1024 * 1024) {
      setNotice("Selecione um certificado A1 de até 10 MB.");
      return;
    }
    const data = await fileAsBase64(certificate.file);
    await run(
      () =>
        uploadFiscalCertificate({
          branchId,
          name: certificate.file?.name ?? "Certificado A1",
          password: certificate.password,
          data,
          filename: certificate.file?.name ?? "certificate.pfx",
        }),
      "Certificado transmitido ao simulador sem retenção do arquivo.",
    );
    setCertificate({ file: null, password: "" });
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>
            <FileCheck2 size={16} /> Fiscal por filial
          </span>
          <h1>Emissão fiscal, etapa por etapa</h1>
          <p>
            Leitura simples para a operação e controles avançados somente para responsáveis
            autorizados.
          </p>
        </div>
        <button
          className={styles.secondary}
          disabled={!branchId || busy}
          onClick={safeRefresh}
          type="button"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>
      <div className={styles.notice} role="status">
        {onboarding?.status === "action_required"
          ? "A configuração precisa de revisão antes de continuar. "
          : ""}
        {notice}
      </div>

      <section className={styles.progress} aria-label="Progresso da configuração fiscal">
        {steps.map(([status, title, description], index) => (
          <article className={index < progress ? styles.done : ""} key={status}>
            <span>{index < progress ? <CheckCircle2 size={18} /> : index + 1}</span>
            <div>
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
          </article>
        ))}
      </section>

      {!onboarding || onboarding.status === "not_started" ? (
        <section className={styles.panel}>
          <Building2 size={26} />
          <div>
            <h2>Comece pela empresa</h2>
            <p>A configuração nasce isolada por filial e sempre começa em homologação.</p>
          </div>
          {canConfigure ? (
            <button
              className={styles.primary}
              disabled={!branchId || busy}
              onClick={() =>
                void run(() => startFiscalOnboarding(branchId), "Configuração iniciada.")
              }
              type="button"
            >
              Iniciar configuração
            </button>
          ) : (
            <p className={styles.help}>Seu perfil possui acesso somente para consulta.</p>
          )}
        </section>
      ) : null}

      {onboarding?.settings && canConfigure ? (
        <>
          <div className={styles.grid}>
            <form className={styles.panel} onSubmit={saveCompany}>
              <div className={styles.panelTitle}>
                <div>
                  <span className={styles.kicker}>Etapa 1</span>
                  <h2>Dados da empresa</h2>
                </div>
                <ShieldCheck size={22} />
              </div>
              <div className={styles.formGrid}>
                <label>
                  Razão social
                  <input
                    required
                    value={company.legalName}
                    onChange={(e) => setCompany({ ...company, legalName: e.target.value })}
                  />
                </label>
                <label>
                  Nome fantasia
                  <input
                    value={company.tradeName}
                    onChange={(e) => setCompany({ ...company, tradeName: e.target.value })}
                  />
                </label>
                <label>
                  CNPJ
                  <input
                    required
                    inputMode="numeric"
                    value={company.document}
                    onChange={(e) => setCompany({ ...company, document: e.target.value })}
                  />
                </label>
                <label>
                  Inscrição estadual
                  <input
                    required
                    value={company.stateRegistration}
                    onChange={(e) => setCompany({ ...company, stateRegistration: e.target.value })}
                  />
                </label>
                <label>
                  Inscrição municipal
                  <input
                    value={company.municipalRegistration}
                    onChange={(e) =>
                      setCompany({ ...company, municipalRegistration: e.target.value })
                    }
                  />
                </label>
                <label>
                  Regime tributário
                  <select
                    required
                    value={company.taxRegime}
                    onChange={(e) => setCompany({ ...company, taxRegime: e.target.value })}
                  >
                    <option value="">Selecione com o contador</option>
                    <option value="simples_nacional">Simples Nacional</option>
                    <option value="regime_normal">Regime normal</option>
                  </select>
                </label>
                <label>
                  Município
                  <input
                    required
                    value={company.cityName}
                    onChange={(e) => setCompany({ ...company, cityName: e.target.value })}
                  />
                </label>
                <label>
                  UF
                  <input
                    required
                    maxLength={2}
                    value={company.uf}
                    onChange={(e) => setCompany({ ...company, uf: e.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  Código IBGE
                  <input
                    required
                    value={company.cityCode}
                    onChange={(e) => setCompany({ ...company, cityCode: e.target.value })}
                  />
                </label>
              </div>
              <button className={styles.primary} disabled={busy} type="submit">
                Salvar dados
              </button>
            </form>

            <aside className={styles.stack}>
              <section className={styles.panel}>
                <div className={styles.panelTitle}>
                  <div>
                    <span className={styles.kicker}>Apoio</span>
                    <h2>Contador</h2>
                  </div>
                  <UserRoundPlus size={22} />
                </div>
                <p>Convite temporário, limitado à revisão fiscal desta filial.</p>
                <label>
                  E-mail do contador
                  <input
                    type="email"
                    value={accountantEmail}
                    onChange={(e) => setAccountantEmail(e.target.value)}
                    placeholder="contador@empresa.com.br"
                  />
                </label>
                <button
                  className={styles.secondary}
                  disabled={busy || !accountantEmail}
                  onClick={() =>
                    void run(
                      () => inviteFiscalAccountant(branchId, accountantEmail),
                      "Convite criado; o envio depende do provedor de e-mail externo.",
                    )
                  }
                  type="button"
                >
                  Criar convite
                </button>
                <div className={styles.list}>
                  {onboarding.invitations
                    .filter((item) => !item.revokedAt)
                    .map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.email}</strong>
                          <small>
                            Expira em {new Date(item.expiresAt).toLocaleString("pt-BR")}
                          </small>
                        </div>
                        <button
                          className={styles.danger}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => revokeFiscalAccountantInvitation(item.id),
                              "Convite revogado.",
                            )
                          }
                          type="button"
                        >
                          Revogar
                        </button>
                      </article>
                    ))}
                </div>
              </section>
              <section className={styles.panel}>
                <span className={styles.kicker}>Etapa 2</span>
                <h2>Revisão tributária</h2>
                <p>Confirme estes dados com o contador. Nenhum município ou regime é presumido.</p>
                <div className={styles.formGrid}>
                  <label>
                    Série
                    <input
                      required
                      value={taxReview.series}
                      onChange={(e) => setTaxReview({ ...taxReview, series: e.target.value })}
                    />
                  </label>
                  <label>
                    Modelo
                    <select
                      required
                      value={taxReview.model}
                      onChange={(e) =>
                        setTaxReview({
                          ...taxReview,
                          model: e.target.value as typeof taxReview.model,
                        })
                      }
                    >
                      <option value="">Selecione</option>
                      <option value="nfce">NFC-e</option>
                      <option value="nfe">NF-e</option>
                      <option value="nfse">NFS-e</option>
                    </select>
                  </label>
                </div>
                <label className={styles.check}>
                  <input
                    checked={taxReview.confirmed}
                    onChange={(e) => setTaxReview({ ...taxReview, confirmed: e.target.checked })}
                    type="checkbox"
                  />{" "}
                  Confirmo que estes dados foram revisados com o responsável fiscal.
                </label>
                <div className={styles.actions}>
                  <button
                    className={styles.secondary}
                    disabled={busy || !taxReview.confirmed}
                    onClick={prepareSimulator}
                    type="button"
                  >
                    Preparar simulador
                  </button>
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={homologate}
                    type="button"
                  >
                    Executar cenários
                  </button>
                </div>
              </section>
            </aside>
          </div>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelTitle}>
                <div>
                  <span className={styles.kicker}>Credencial segregada</span>
                  <h2>Token do emissor</h2>
                </div>
                <KeyRound size={22} />
              </div>
              <p>O valor é criptografado, nunca reaparece e fica isolado por filial e ambiente.</p>
              <label>
                Ambiente
                <select
                  value={credential.environment}
                  onChange={(e) =>
                    setCredential({
                      ...credential,
                      environment: e.target.value as typeof credential.environment,
                    })
                  }
                >
                  <option value="homologation">Homologação</option>
                  <option value="production">Produção</option>
                </select>
              </label>
              <label>
                Token
                <input
                  autoComplete="off"
                  type="password"
                  value={credential.token}
                  onChange={(e) => setCredential({ ...credential, token: e.target.value })}
                />
              </label>
              <button
                className={styles.secondary}
                disabled={busy || credential.token.length < 8}
                onClick={() =>
                  void run(
                    () => saveFiscalCredential({ branchId, ...credential }),
                    "Credencial substituída com segurança.",
                  )
                }
                type="button"
              >
                Salvar credencial
              </button>
              <div className={styles.list}>
                {onboarding.credentials.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>
                        {item.environment === "production" ? "Produção" : "Homologação"}
                      </strong>
                      <small>
                        Final {item.tokenLastFour ?? "indisponível"} · {item.status}
                      </small>
                    </div>
                    {item.status === "active" ? (
                      <button
                        className={styles.danger}
                        disabled={busy}
                        onClick={() =>
                          void run(() => revokeFiscalCredential(item.id), "Credencial revogada.")
                        }
                        type="button"
                      >
                        Revogar
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
            <form className={styles.panel} onSubmit={(event) => void sendCertificate(event)}>
              <span className={styles.kicker}>Certificado A1</span>
              <h2>Transmitir sem armazenar</h2>
              <p>O arquivo é enviado para validação e apagado da memória após o processamento.</p>
              <label>
                Arquivo PFX/P12
                <input
                  accept=".pfx,.p12,application/x-pkcs12"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCertificate({ ...certificate, file: e.target.files?.[0] ?? null })
                  }
                  type="file"
                />
              </label>
              <label>
                Senha do certificado
                <input
                  autoComplete="new-password"
                  type="password"
                  value={certificate.password}
                  onChange={(e) => setCertificate({ ...certificate, password: e.target.value })}
                />
              </label>
              <button
                className={styles.primary}
                disabled={busy || !certificate.file || !certificate.password}
                type="submit"
              >
                Validar certificado
              </button>
            </form>
          </div>

          {canActivate ? (
            <section className={styles.panel}>
              <span className={styles.kicker}>Gate final</span>
              <h2>{onboarding.production.branchEnabled ? "Produção ativa" : "Ativar produção"}</h2>
              <p>
                A infraestrutura global, credencial de produção, certificado, homologação e MFA
                precisam estar válidos. Sem isso, a operação falha fechada.
              </p>
              <label>
                Justificativa
                <input
                  value={production.reason}
                  onChange={(e) => setProduction({ ...production, reason: e.target.value })}
                />
              </label>
              {!onboarding.production.branchEnabled ? (
                <label>
                  Código MFA
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={production.mfaCode}
                    onChange={(e) =>
                      setProduction({ ...production, mfaCode: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </label>
              ) : null}
              <button
                className={onboarding.production.branchEnabled ? styles.danger : styles.primary}
                disabled={
                  busy ||
                  production.reason.length < 8 ||
                  (!onboarding.production.branchEnabled && production.mfaCode.length !== 6)
                }
                onClick={() =>
                  void run(
                    () =>
                      onboarding.production.branchEnabled
                        ? disableFiscalProduction(branchId, production.reason)
                        : enableFiscalProduction(branchId, {
                            reason: production.reason,
                            mfaCode: production.mfaCode,
                            expectedVersion: onboarding.settings?.version ?? 1,
                          }),
                    onboarding.production.branchEnabled
                      ? "Produção fiscal desativada."
                      : "Produção fiscal ativada.",
                  )
                }
                type="button"
              >
                {onboarding.production.branchEnabled ? "Desativar produção" : "Ativar com MFA"}
              </button>
            </section>
          ) : null}
        </>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <div>
            <span className={styles.kicker}>Operação</span>
            <h2>Documentos fiscais</h2>
          </div>
          <strong>{documents.length}</strong>
        </div>
        <div className={styles.list}>
          {documents.length ? (
            documents.map((doc) => (
              <article key={doc.id}>
                <div>
                  <strong>
                    {doc.model.toUpperCase()}{" "}
                    {doc.number ? `${doc.series ?? "1"}-${doc.number}` : "aguardando numeração"}
                  </strong>
                  <small>
                    Pedido {doc.orderId?.slice(0, 8) ?? "não vinculado"} · {statusLabel(doc.status)}
                  </small>
                </div>
                {canManage ? (
                  <div className={styles.actions}>
                    {["pending", "error", "contingency"].includes(doc.status) ? (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => retryFiscalDocument(doc.id),
                            "Consulta de reconciliação agendada.",
                          )
                        }
                        type="button"
                      >
                        <RefreshCw size={14} /> Consultar
                      </button>
                    ) : null}
                    {doc.status === "authorized" ? (
                      <button
                        className={styles.danger}
                        disabled={busy}
                        onClick={() => setCanceling({ documentId: doc.id, reason: "" })}
                        type="button"
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <p className={styles.empty}>Nenhum documento emitido nesta filial.</p>
          )}
        </div>
      </section>

      {canceling ? (
        <Dialog
          className={styles.panel ?? ""}
          onClose={() => setCanceling(null)}
          open
          title="Confirmar cancelamento fiscal"
        >
          <p>
            Informe o motivo real. Esta solicitação ficará na auditoria e será processada de forma
            idempotente.
          </p>
          <label>
            Motivo
            <input
              data-dialog-initial-focus
              onChange={(event) => setCanceling({ ...canceling, reason: event.target.value })}
              value={canceling.reason}
            />
          </label>
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={() => setCanceling(null)} type="button">
              Voltar
            </button>
            <button
              className={styles.danger}
              disabled={busy || canceling.reason.trim().length < 15}
              onClick={() =>
                void run(
                  () =>
                    cancelFiscalDocument(
                      canceling.documentId,
                      canceling.reason,
                      `fiscal-cancel-${canceling.documentId}-${crypto.randomUUID()}`,
                    ),
                  "Cancelamento enviado para processamento.",
                ).then(() => setCanceling(null))
              }
              type="button"
            >
              Confirmar cancelamento
            </button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}

function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o certificado."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

function statusLabel(status: string) {
  return (
    (
      {
        pending: "Em processamento",
        authorized: "Autorizado",
        rejected: "Rejeitado",
        error: "Requer atenção",
        contingency: "Em contingência",
        canceled: "Cancelado",
      } as Record<string, string>
    )[status] ?? status
  );
}
