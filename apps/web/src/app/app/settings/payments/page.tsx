"use client";

import { CheckCircle2, CreditCard, MonitorSmartphone, RefreshCw, ShieldAlert } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type BranchPaymentSettingsResponse,
  createPaymentTerminal,
  getBranchPaymentSettings,
  getSession,
  listPaymentTerminals,
  type PaymentTerminal,
  revokePaymentTerminal,
  updateBranchPaymentSettings,
} from "../../../../lib/giromesa-api";
import styles from "../../fiscal/fiscal.module.css";

const profiles = [
  [
    "external_terminal",
    "Maquininha independente",
    "Registre no GiroMesa o que foi recebido na maquininha. Melhor ponto de partida.",
  ],
  [
    "smartpos",
    "SmartPOS integrado",
    "O valor segue para a maquininha compatível. Depende do plano e do fornecedor.",
  ],
  ["tef", "TEF no caixa", "Pagamento comandado pelo PDV fixo. Exige infraestrutura e homologação."],
  [
    "hybrid",
    "Operação híbrida",
    "Combina integração e registro manual com regras de contingência.",
  ],
] as const;

export default function PaymentSettingsPage() {
  const [branchId, setBranchId] = useState("");
  const [response, setResponse] = useState<BranchPaymentSettingsResponse | null>(null);
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [notice, setNotice] = useState("Carregando formas de recebimento...");
  const [busy, setBusy] = useState(false);
  const [terminalName, setTerminalName] = useState("");
  const [terminalProvider, setTerminalProvider] = useState("manual");
  const [providerTerminalId, setProviderTerminalId] = useState("");
  const [pairingCode, setPairingCode] = useState("");

  const refresh = useCallback(async (activeBranchId: string) => {
    const [settings, devices] = await Promise.all([
      getBranchPaymentSettings(activeBranchId),
      listPaymentTerminals(activeBranchId),
    ]);
    setResponse(settings);
    setTerminals(devices);
    setNotice("Configuração de recebimento atualizada.");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        if (!session.branchId) throw new Error();
        setBranchId(session.branchId);
        await refresh(session.branchId);
      } catch {
        setNotice("Entre com uma conta autorizada para configurar recebimentos.");
      }
    })();
  }, [refresh]);

  async function saveProfile(profile: BranchPaymentSettingsResponse["settings"]["profile"]) {
    if (!response) return;
    const preferredMode =
      profile === "smartpos" ? "smartpos" : profile === "tef" ? "tef" : "manual";
    setBusy(true);
    try {
      await updateBranchPaymentSettings(branchId, {
        profile,
        preferredMode,
        allowManualFallback: response.settings.allowManualFallback,
        reconciliationMode: response.settings.reconciliationMode ?? "manual",
        ...(response.settings.provider !== undefined
          ? { provider: response.settings.provider }
          : {}),
        status: response.settings.status,
        expectedVersion: response.settings.version,
      });
      await refresh(branchId);
      setNotice("Perfil de recebimento salvo.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Este recurso ainda não está disponível para o plano atual.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    if (!response) return;
    setBusy(true);
    try {
      await updateBranchPaymentSettings(branchId, {
        profile: response.settings.profile,
        preferredMode: response.settings.preferredMode,
        allowManualFallback: response.settings.allowManualFallback,
        reconciliationMode: response.settings.reconciliationMode,
        ...(response.settings.provider ? { provider: response.settings.provider } : {}),
        status: response.settings.status,
        expectedVersion: response.settings.version,
      });
      await refresh(branchId);
      setNotice("Regras de recebimento salvas.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar as regras.");
    } finally {
      setBusy(false);
    }
  }

  function addTerminal(event: FormEvent) {
    event.preventDefault();
    if (!terminalName) return;
    setBusy(true);
    void createPaymentTerminal({
      branchId,
      name: terminalName,
      provider: terminalProvider,
      ...(providerTerminalId ? { providerTerminalId } : {}),
      capabilities: { manual: true, smartpos: terminalProvider !== "manual" },
    })
      .then(async (created) => {
        setPairingCode(created.localPairingCode ?? "");
        await refresh(branchId);
      })
      .then(() => {
        setTerminalName("");
        setProviderTerminalId("");
        setNotice("Terminal cadastrado para conferência.");
      })
      .catch((error: unknown) =>
        setNotice(
          error instanceof Error ? error.message : "Não foi possível cadastrar o terminal.",
        ),
      )
      .finally(() => setBusy(false));
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>
            <CreditCard size={16} /> Recebimentos
          </span>
          <h1>Escolha como sua filial recebe</h1>
          <p>
            Comece simples e ative integrações somente quando houver fornecedor, plano e equipamento
            homologados.
          </p>
        </div>
        <button
          className={styles.secondary}
          disabled={!branchId || busy}
          onClick={() => void refresh(branchId)}
          type="button"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>
      <div className={styles.notice} role="status">
        {notice}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <div>
            <span className={styles.kicker}>Perfil da filial</span>
            <h2>Como o pagamento acontece</h2>
          </div>
          <ShieldAlert size={22} />
        </div>
        <div className={styles.profileGrid}>
          {profiles.map(([value, title, description]) => {
            const selected = response?.settings.profile === value;
            const available =
              value === "external_terminal" ||
              value === "hybrid" ||
              (value === "smartpos" ? response?.availability.smartpos : response?.availability.tef);
            return (
              <article className={styles.panel} key={value}>
                <div className={styles.panelTitle}>
                  <div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                  </div>
                  {selected ? <CheckCircle2 color="#18b97a" /> : <MonitorSmartphone />}
                </div>
                <button
                  className={selected ? styles.secondary : styles.primary}
                  disabled={busy || !available}
                  onClick={() => void saveProfile(value)}
                  type="button"
                >
                  {selected
                    ? "Perfil atual"
                    : available
                      ? "Usar este perfil"
                      : "Requer contratação"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {response ? (
        <form className={styles.panel} onSubmit={(event) => void saveConfiguration(event)}>
          <span className={styles.kicker}>Regras da filial</span>
          <h2>Contingência e conferência</h2>
          <div className={styles.formGrid}>
            <label>
              Estado
              <select
                value={response.settings.status}
                onChange={(event) =>
                  setResponse({
                    ...response,
                    settings: {
                      ...response.settings,
                      status: event.target.value as "active" | "disabled",
                    },
                  })
                }
              >
                <option value="active">Ativo</option>
                <option value="disabled">Desativado</option>
              </select>
            </label>
            <label>
              Conferência
              <select
                value={response.settings.reconciliationMode}
                onChange={(event) =>
                  setResponse({
                    ...response,
                    settings: {
                      ...response.settings,
                      reconciliationMode: event.target.value as "manual" | "import" | "automatic",
                    },
                  })
                }
              >
                <option value="manual">Manual</option>
                <option value="import">Importar CSV</option>
                <option disabled={!response.availability.automaticReconciliation} value="automatic">
                  Automática (requer contrato)
                </option>
              </select>
            </label>
            <label>
              Fornecedor
              <input
                placeholder="Ex.: Cielo, Rede ou Stone"
                value={response.settings.provider ?? ""}
                onChange={(event) =>
                  setResponse({
                    ...response,
                    settings: { ...response.settings, provider: event.target.value || null },
                  })
                }
              />
            </label>
            <label className={styles.check}>
              <input
                checked={response.settings.allowManualFallback}
                onChange={(event) =>
                  setResponse({
                    ...response,
                    settings: { ...response.settings, allowManualFallback: event.target.checked },
                  })
                }
                type="checkbox"
              />{" "}
              Permitir registro manual quando a integração estiver indisponível, com confirmação
              gerencial.
            </label>
          </div>
          <button className={styles.primary} disabled={busy} type="submit">
            Salvar regras
          </button>
        </form>
      ) : null}

      <div className={styles.grid}>
        <form className={styles.panel} onSubmit={addTerminal}>
          <span className={styles.kicker}>Dispositivos</span>
          <h2>Cadastrar maquininha ou terminal</h2>
          <p>Use um nome reconhecível pela equipe, como “Maquininha salão 1”.</p>
          <label>
            Nome do terminal
            <input
              value={terminalName}
              onChange={(event) => setTerminalName(event.target.value)}
              placeholder="Maquininha salão 1"
              required
            />
          </label>
          <label>
            Fornecedor
            <select
              value={terminalProvider}
              onChange={(event) => setTerminalProvider(event.target.value)}
            >
              <option value="manual">Maquininha independente</option>
              <option value="smartpos">SmartPOS</option>
              <option value="tef">TEF</option>
            </select>
          </label>
          <label>
            Identificador do terminal
            <input
              value={providerTerminalId}
              onChange={(event) => setProviderTerminalId(event.target.value)}
              placeholder="Opcional no modo manual"
            />
          </label>
          <button className={styles.primary} disabled={busy || !branchId} type="submit">
            Cadastrar terminal
          </button>
          {pairingCode ? (
            <div className={styles.notice} role="status">
              <strong>Código local de pareamento: {pairingCode}</strong>
              <small>
                Visível apenas agora no ambiente local. Guarde somente durante a ativação.
              </small>
            </div>
          ) : null}
        </form>
        <section className={styles.panel}>
          <span className={styles.kicker}>Conferência</span>
          <h2>Terminais desta filial</h2>
          <div className={styles.list}>
            {terminals.length ? (
              terminals.map((terminal) => (
                <article key={terminal.id}>
                  <div>
                    <strong>{terminal.name}</strong>
                    <small>
                      {terminal.provider ?? "Registro manual"} · {terminalStatus(terminal.status)}
                      {terminal.providerTerminalId ? ` · ${terminal.providerTerminalId}` : ""}
                    </small>
                  </div>
                  {terminal.status !== "revoked" ? (
                    <button
                      className={styles.danger}
                      disabled={busy}
                      onClick={() =>
                        void revokePaymentTerminal(terminal.id)
                          .then(() => refresh(branchId))
                          .catch((error: unknown) =>
                            setNotice(
                              error instanceof Error
                                ? error.message
                                : "Não foi possível revogar o terminal.",
                            ),
                          )
                      }
                      type="button"
                    >
                      Revogar
                    </button>
                  ) : null}
                </article>
              ))
            ) : (
              <p className={styles.empty}>Nenhum terminal cadastrado.</p>
            )}
          </div>
        </section>
      </div>
      <p className={styles.help}>
        SmartPOS, TEF e conciliação automática permanecem bloqueados sem entitlement e fornecedor
        configurado. O registro manual e a importação CSV funcionam sem credenciais externas.
      </p>
    </main>
  );
}

function terminalStatus(status: string) {
  return (
    ({ active: "Ativo", revoked: "Revogado", offline: "Offline" } as Record<string, string>)[
      status
    ] ?? status
  );
}
