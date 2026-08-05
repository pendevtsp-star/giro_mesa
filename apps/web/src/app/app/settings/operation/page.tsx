"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Moon,
  Palette,
  Plus,
  Save,
  ShieldCheck,
  Sun,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApprovalPinDialog } from "../../../../features/approvals/ApprovalPinDialog";
import {
  type ApprovalRequest,
  activateOperationalDevice,
  type BranchOperationalSettings,
  type BusinessHourException,
  decideApprovalRequest,
  formatMoney,
  getBranchOperationalSettings,
  getBusinessHours,
  getOperationPolicy,
  getSession,
  listApprovalRequests,
  listKdsStations,
  listOperationalDevices,
  listPrinterDevices,
  type OperationPolicy,
  registerOperationalDevice,
  replaceBusinessHours,
  revokeOperationalDevice,
  setOperatorPin,
  updateBranchOperationalSettings,
  updateOperationPolicy,
  type WeeklyBusinessHour,
} from "../../../../lib/giromesa-api";

type Decision = { approval: ApprovalRequest; kind: "approve" | "reject" } | null;

const weekdays = [
  [0, "Domingo"],
  [1, "Segunda-feira"],
  [2, "Terça-feira"],
  [3, "Quarta-feira"],
  [4, "Quinta-feira"],
  [5, "Sexta-feira"],
  [6, "Sábado"],
] as const;

const kdsShortcutFields = [
  ["refresh", "Atualizar fila"],
  ["sound", "Som"],
  ["fullscreen", "Tela cheia"],
  ["advance", "Avançar ticket"],
  ["return", "Retornar ticket"],
  ["recall", "Rever última entrega"],
  ["up", "Selecionar acima"],
  ["down", "Selecionar abaixo"],
] as const;

export default function OperationSettingsPage() {
  const [policy, setPolicy] = useState<OperationPolicy | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [discountPercent, setDiscountPercent] = useState("10");
  const [managerPin, setManagerPin] = useState("");
  const [decision, setDecision] = useState<Decision>(null);
  const [deviceToken, setDeviceToken] = useState("");
  const [branchId, setBranchId] = useState("");
  const [weekly, setWeekly] = useState<WeeklyBusinessHour[]>([]);
  const [exceptions, setExceptions] = useState<BusinessHourException[]>([]);
  const [branchSettings, setBranchSettings] = useState<BranchOperationalSettings | null>(null);
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionClosed, setExceptionClosed] = useState(true);
  const [message, setMessage] = useState("Carregando regras operacionais...");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [devices, setDevices] = useState<
    Array<{
      id: string;
      name: string;
      kind: string;
      status: string;
      kdsInput: string;
      theme: string;
      initialMode: string;
      stationId: string | null;
      printerDeviceId: string | null;
      allowModeSwitch: boolean;
    }>
  >([]);
  const [personalPin, setPersonalPin] = useState("");
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const [printers, setPrinters] = useState<Array<{ id: string; name: string }>>([]);
  const [deviceForm, setDeviceForm] = useState({
    name: "",
    kind: "waiter",
    theme: "system",
    kdsInput: "hybrid",
    initialMode: "table",
    stationId: "",
    printerDeviceId: "",
    allowModeSwitch: false,
  });

  const load = useCallback(async () => {
    const [nextPolicy, nextApprovals, session] = await Promise.all([
      getOperationPolicy(),
      listApprovalRequests(),
      getSession(),
    ]);
    setPolicy(nextPolicy);
    setDiscountPercent(String(nextPolicy.maxDiscountWithoutApprovalBps / 100));
    setApprovals(nextApprovals);
    if (session.branchId) {
      const [hours, settings] = await Promise.all([
        getBusinessHours(session.branchId),
        getBranchOperationalSettings(session.branchId),
      ]);
      const [deviceRows, stationRows, printerRows] = await Promise.all([
        listOperationalDevices(session.branchId),
        listKdsStations().catch(() => []),
        listPrinterDevices(session.branchId).catch(() => []),
      ]);
      setBranchId(session.branchId);
      setWeekly(hours.weekly);
      setExceptions(hours.exceptions);
      setBranchSettings(settings);
      setDevices(deviceRows);
      setStations(stationRows.filter((station) => station.branchId === session.branchId));
      setPrinters(printerRows.filter((printer) => printer.isActive));
    }
    setMessage(
      nextApprovals.length > 0
        ? `${nextApprovals.length} solicitação(ões) aguardando decisão.`
        : "Política ativa. Nenhuma aprovação pendente.",
    );
  }, []);

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Falha ao carregar regras."),
    );
  }, [load]);

  // ponytail: keep one primary interval per weekday in this rollout; the API already supports more.
  function updateSlot(weekday: number, patch: Partial<WeeklyBusinessHour>) {
    setWeekly((current) => {
      const existing = current.find((slot) => slot.weekday === weekday && slot.sortOrder === 0);
      if (existing) {
        return current.map((slot) => (slot === existing ? { ...slot, ...patch } : slot));
      }
      return [
        ...current,
        {
          weekday,
          sortOrder: 0,
          opensAt: "18:00",
          closesAt: "23:00",
          ...patch,
        },
      ];
    });
  }

  function removeSlot(weekday: number) {
    setWeekly((current) => current.filter((slot) => slot.weekday !== weekday));
  }

  async function saveHours() {
    if (!branchId) return;
    setBusy(true);
    try {
      const saved = await replaceBusinessHours(branchId, { weekly, exceptions });
      setWeekly(saved.weekly);
      setExceptions(saved.exceptions);
      setMessage("Horários e exceções salvos com auditoria.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar horários.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBranchSettings() {
    if (!branchId || !branchSettings) return;
    setBusy(true);
    try {
      const saved = await updateBranchOperationalSettings(branchId, {
        defaultTheme: branchSettings.defaultTheme,
        defaultKdsInputMode: branchSettings.defaultKdsInputMode,
        kdsShortcuts: branchSettings.kdsShortcuts,
        cleaningMode: branchSettings.cleaningMode,
        allowWaiterPayments: branchSettings.allowWaiterPayments,
        waiterResponsibilityPolicy: branchSettings.waiterResponsibilityPolicy,
      });
      setBranchSettings(saved);
      setMessage("Preferências da filial salvas.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar preferências.");
    } finally {
      setBusy(false);
    }
  }

  function addException() {
    if (!exceptionDate) return;
    setExceptions((current) =>
      [
        ...current.filter((exception) => exception.date !== exceptionDate),
        {
          date: exceptionDate,
          isClosed: exceptionClosed,
          intervals: exceptionClosed ? [] : [{ opensAt: "18:00", closesAt: "23:00" }],
          reason: exceptionReason || null,
        },
      ].sort((left, right) => left.date.localeCompare(right.date)),
    );
    setExceptionDate("");
    setExceptionReason("");
  }

  async function savePolicy() {
    if (!policy) return;
    setBusy(true);
    try {
      const updated = await updateOperationPolicy({
        maxDiscountWithoutApprovalBps: Math.round(Number(discountPercent) * 100),
        requireCancellationReason: policy.requireCancellationReason,
        requireApprovalAfterKitchen: policy.requireApprovalAfterKitchen,
        returnStockOnApprovedCancellation: policy.returnStockOnApprovedCancellation,
        ...(managerPin ? { managerPin } : {}),
      });
      setPolicy(updated);
      setManagerPin("");
      setMessage("Política operacional salva e auditada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar política.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDecision(pin: string, reason: string) {
    if (!decision) return;
    setBusy(true);
    setDialogError(null);
    try {
      await decideApprovalRequest(decision.approval.id, decision.kind, {
        managerPin: pin,
        ...(reason ? { reason } : {}),
      });
      setDecision(null);
      await load();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Não foi possível validar o PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function savePersonalPin() {
    if (!branchId || !/^\d{4,8}$/.test(personalPin)) {
      setMessage("Informe um PIN numérico de 4 a 8 dígitos.");
      return;
    }
    setBusy(true);
    try {
      await setOperatorPin(branchId, personalPin);
      setPersonalPin("");
      setMessage("PIN pessoal atualizado com auditoria.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function addDevice() {
    if (!branchId || deviceForm.name.trim().length < 2) return;
    setBusy(true);
    try {
      const created = await registerOperationalDevice({
        branchId,
        name: deviceForm.name.trim(),
        kind: deviceForm.kind,
        theme: deviceForm.theme as "light" | "dark" | "system",
        kdsInput: deviceForm.kdsInput as "touch" | "keyboard" | "hybrid" | "printer",
        initialMode: deviceForm.initialMode as
          | "table"
          | "counter"
          | "bar"
          | "cashier"
          | "kds"
          | "expedition",
        ...(deviceForm.stationId ? { stationId: deviceForm.stationId } : {}),
        ...(deviceForm.printerDeviceId ? { printerDeviceId: deviceForm.printerDeviceId } : {}),
        allowModeSwitch: deviceForm.allowModeSwitch,
      });
      setDevices((current) => [...current, created]);
      setDeviceToken(created.token);
      setDeviceForm({
        name: "",
        kind: "waiter",
        theme: "system",
        kdsInput: "hybrid",
        initialMode: "table",
        stationId: "",
        printerDeviceId: "",
        allowModeSwitch: false,
      });
      setMessage("Dispositivo registrado. Ative-o abaixo; o token só é exibido uma vez.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao registrar dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page operation-settings-page">
      <header className="workspace-topbar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </header>

      <section className="workspace-heading">
        <span className="section-kicker">
          <ShieldCheck size={16} /> Controle operacional
        </span>
        <h1>Políticas e aprovações</h1>
        <p>{message}</p>
      </section>

      <section className="operation-settings-grid">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Política efetiva</span>
              <h2>Limites do turno</h2>
            </div>
          </div>
          {policy ? (
            <div className="settings-form">
              <label>
                Desconto sem aprovação (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercent}
                  onChange={(event) => setDiscountPercent(event.target.value)}
                />
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={policy.requireCancellationReason}
                  onChange={(event) =>
                    setPolicy({ ...policy, requireCancellationReason: event.target.checked })
                  }
                />
                Exigir motivo no cancelamento
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={policy.requireApprovalAfterKitchen}
                  onChange={(event) =>
                    setPolicy({ ...policy, requireApprovalAfterKitchen: event.target.checked })
                  }
                />
                Exigir aprovação após envio à cozinha
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={policy.returnStockOnApprovedCancellation}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      returnStockOnApprovedCancellation: event.target.checked,
                    })
                  }
                />
                Estornar estoque em cancelamento aprovado
              </label>
              <label>
                Novo PIN gerencial
                <input
                  type="password"
                  inputMode="numeric"
                  minLength={4}
                  maxLength={12}
                  placeholder="Deixe vazio para manter"
                  value={managerPin}
                  onChange={(event) => setManagerPin(event.target.value.replace(/\D/g, ""))}
                />
              </label>
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => void savePolicy()}
              >
                Salvar política
              </button>
            </div>
          ) : (
            <p className="muted-copy">Nenhuma política configurada para este perfil.</p>
          )}
        </article>

        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Fila gerencial</span>
              <h2>Aguardando aprovação</h2>
            </div>
            <span className="count-chip">{approvals.length}</span>
          </div>
          <div className="approval-list">
            {approvals.map((approval) => (
              <div className="approval-card" key={approval.id}>
                <div>
                  <strong>
                    {approval.action === "order.discount"
                      ? "Desconto no pedido"
                      : "Cancelamento de item"}
                  </strong>
                  <p>{approval.reason ?? "Sem motivo informado"}</p>
                  <small>
                    {approval.requestedValueCents
                      ? formatMoney(approval.requestedValueCents)
                      : `Pedido ${String(approval.metadata.orderId ?? approval.entityId).slice(0, 8)}`}
                  </small>
                </div>
                <div className="toolbar">
                  <button
                    className="button ghost compact"
                    type="button"
                    onClick={() => setDecision({ approval, kind: "reject" })}
                  >
                    <XCircle size={15} /> Rejeitar
                  </button>
                  <button
                    className="button primary compact"
                    type="button"
                    onClick={() => setDecision({ approval, kind: "approve" })}
                  >
                    <CheckCircle2 size={15} /> Aprovar
                  </button>
                </div>
              </div>
            ))}
            {approvals.length === 0 ? (
              <p className="muted-copy">Nenhuma solicitação pendente.</p>
            ) : null}
          </div>
        </article>
      </section>

      {branchId ? (
        <section className="operation-settings-grid operation-settings-secondary">
          <article className="workspace-panel operation-hours-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">
                  <Clock3 size={16} /> Horário da casa
                </span>
                <h2>Agenda semanal</h2>
              </div>
              <button
                className="button primary compact"
                disabled={busy}
                onClick={() => void saveHours()}
                type="button"
              >
                <Save size={15} /> Salvar horários
              </button>
            </div>
            <p className="muted-copy">
              Use o fechamento no dia seguinte para casas que atravessam a madrugada. Dias sem
              intervalo ficam fechados.
            </p>
            <div className="business-hours-list">
              {weekdays.map(([weekday, label]) => {
                const slot = weekly.find(
                  (item) => item.weekday === weekday && item.sortOrder === 0,
                );
                return (
                  <div className="business-hours-day" key={weekday}>
                    <strong>{label}</strong>
                    {slot ? (
                      <>
                        <label>
                          <span className="visually-hidden">Abertura de {label}</span>
                          <input
                            aria-label={`Abertura de ${label}`}
                            type="time"
                            value={slot.opensAt}
                            onChange={(event) =>
                              updateSlot(weekday, { opensAt: event.target.value })
                            }
                          />
                        </label>
                        <span aria-hidden="true">até</span>
                        <label>
                          <span className="visually-hidden">Fechamento de {label}</span>
                          <input
                            aria-label={`Fechamento de ${label}`}
                            type="time"
                            value={slot.closesAt}
                            onChange={(event) =>
                              updateSlot(weekday, { closesAt: event.target.value })
                            }
                          />
                        </label>
                        <button
                          aria-label={`Fechar ${label}`}
                          className="button ghost compact icon-only"
                          onClick={() => removeSlot(weekday)}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="button secondary compact"
                        onClick={() => updateSlot(weekday, {})}
                        type="button"
                      >
                        <Plus size={15} /> Adicionar horário
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="business-hours-exceptions">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="section-kicker">Exceções</span>
                  <h3>Feriados e alterações pontuais</h3>
                </div>
              </div>
              <div className="business-hours-exception-form">
                <label>
                  Data
                  <input
                    type="date"
                    value={exceptionDate}
                    onChange={(event) => setExceptionDate(event.target.value)}
                  />
                </label>
                <label>
                  Motivo
                  <input
                    placeholder="Ex.: feriado municipal"
                    value={exceptionReason}
                    onChange={(event) => setExceptionReason(event.target.value)}
                  />
                </label>
                <label className="check-line">
                  <input
                    checked={exceptionClosed}
                    onChange={(event) => setExceptionClosed(event.target.checked)}
                    type="checkbox"
                  />
                  Casa fechada
                </label>
                <button
                  className="button secondary compact"
                  disabled={!exceptionDate}
                  onClick={addException}
                  type="button"
                >
                  <Plus size={15} /> Adicionar exceção
                </button>
              </div>
              <div className="business-hours-exception-list">
                {exceptions.map((exception) => (
                  <div className="business-hours-exception" key={exception.date}>
                    <div>
                      <strong>
                        {new Date(`${exception.date}T12:00:00`).toLocaleDateString("pt-BR")}
                      </strong>
                      <span>{exception.isClosed ? "Fechado" : "Horário especial"}</span>
                      {exception.reason ? <small>{exception.reason}</small> : null}
                    </div>
                    <button
                      aria-label={`Remover exceção de ${exception.date}`}
                      className="button ghost compact icon-only"
                      onClick={() =>
                        setExceptions((current) =>
                          current.filter((item) => item.date !== exception.date),
                        )
                      }
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {exceptions.length === 0 ? (
                  <p className="muted-copy">Nenhuma exceção cadastrada.</p>
                ) : null}
              </div>
            </div>
          </article>

          {branchSettings ? (
            <article className="workspace-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">
                    <Palette size={16} /> Preferências da filial
                  </span>
                  <h2>Padrões da operação</h2>
                </div>
              </div>
              <div className="settings-form">
                <label>
                  Tema padrão dos dispositivos
                  <select
                    value={branchSettings.defaultTheme}
                    onChange={(event) =>
                      setBranchSettings({
                        ...branchSettings,
                        defaultTheme: event.target
                          .value as BranchOperationalSettings["defaultTheme"],
                      })
                    }
                  >
                    <option value="light">Claro</option>
                    <option value="dark">Escuro</option>
                    <option value="system">Automático</option>
                  </select>
                </label>
                <p className="muted-copy">
                  Cada operador ainda pode trocar rapidamente o tema no cabeçalho; este valor é o
                  padrão para novos dispositivos.
                </p>
                <label>
                  Entrada padrão do KDS
                  <select
                    value={branchSettings.defaultKdsInputMode}
                    onChange={(event) =>
                      setBranchSettings({
                        ...branchSettings,
                        defaultKdsInputMode: event.target
                          .value as BranchOperationalSettings["defaultKdsInputMode"],
                      })
                    }
                  >
                    <option value="hybrid">Touch + teclado</option>
                    <option value="touch">Touch</option>
                    <option value="keyboard">Teclado</option>
                    <option value="printer">Impressora</option>
                  </select>
                </label>
                <fieldset className="settings-fieldset">
                  <legend>Atalhos do KDS</legend>
                  <p className="muted-copy">
                    Use nomes de tecla do navegador, por exemplo <code>F</code>, <code>R</code> ou
                    <code>ArrowDown</code>. Vazio não é permitido.
                  </p>
                  <div className="settings-shortcut-grid">
                    {kdsShortcutFields.map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          maxLength={20}
                          value={branchSettings.kdsShortcuts[key] ?? ""}
                          onChange={(event) =>
                            setBranchSettings({
                              ...branchSettings,
                              kdsShortcuts: {
                                ...branchSettings.kdsShortcuts,
                                [key]: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="check-line">
                  <input
                    checked={branchSettings.allowWaiterPayments}
                    onChange={(event) =>
                      setBranchSettings({
                        ...branchSettings,
                        allowWaiterPayments: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  Permitir recebimento pelo garçom
                </label>
                <label>
                  Responsabilidade pelas mesas
                  <select
                    value={branchSettings.waiterResponsibilityPolicy}
                    onChange={(event) =>
                      setBranchSettings({
                        ...branchSettings,
                        waiterResponsibilityPolicy: event.target
                          .value as BranchOperationalSettings["waiterResponsibilityPolicy"],
                      })
                    }
                  >
                    <option value="strict">Cada mesa tem um responsável</option>
                    <option value="collaborative">A equipe pode atender em conjunto</option>
                  </select>
                </label>
                <p className="muted-copy">
                  No modo responsável, outro garçom precisa pedir ajuda ou transferência. A autoria
                  de cada lançamento é preservada nos dois modos.
                </p>
                <a className="button secondary" href="/app/team/organization">
                  Organizar mesas da equipe
                </a>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void saveBranchSettings()}
                  type="button"
                >
                  <Save size={16} /> Salvar padrões
                </button>
                <p className="muted-copy">
                  <Sun size={14} /> Claro, <Moon size={14} /> escuro e automático ficam disponíveis
                  para cada usuário.
                </p>
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      {branchId ? (
        <section className="operation-settings-grid operation-settings-secondary">
          <article className="workspace-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Acesso rápido</span>
                <h2>PIN pessoal</h2>
              </div>
            </div>
            <p className="muted-copy">
              Usado para troca rápida e aprovações no dispositivo, sem substituir o login.
            </p>
            <label>
              PIN numérico
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={personalPin}
                onChange={(event) => setPersonalPin(event.target.value.replace(/\D/g, ""))}
              />
            </label>
            <button
              className="button primary compact"
              type="button"
              disabled={busy}
              onClick={() => void savePersonalPin()}
            >
              <ShieldCheck size={15} /> Salvar PIN
            </button>
          </article>
          <article className="workspace-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Terminais</span>
                <h2>Dispositivos operacionais</h2>
              </div>
              <span className="count-chip">
                {devices.filter((device) => device.status === "active").length}
              </span>
            </div>
            <div className="settings-form">
              <label>
                Nome
                <input
                  value={deviceForm.name}
                  onChange={(event) =>
                    setDeviceForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Caixa 01 ou KDS cozinha"
                />
              </label>
              <div className="form-grid-compact">
                <label>
                  Perfil
                  <select
                    value={deviceForm.kind}
                    onChange={(event) =>
                      setDeviceForm((current) => ({ ...current, kind: event.target.value }))
                    }
                  >
                    <option value="waiter">Garçom</option>
                    <option value="pos">PDV</option>
                    <option value="cashier">Caixa</option>
                    <option value="kds">KDS</option>
                    <option value="expedition">Expedição</option>
                    <option value="salon">Salão</option>
                  </select>
                </label>
                <label>
                  Entrada
                  <select
                    value={deviceForm.kdsInput}
                    onChange={(event) =>
                      setDeviceForm((current) => ({ ...current, kdsInput: event.target.value }))
                    }
                  >
                    <option value="hybrid">Híbrida</option>
                    <option value="touch">Touch</option>
                    <option value="keyboard">Teclado</option>
                    <option value="printer">Impressora</option>
                  </select>
                </label>
              </div>
              <div className="form-grid-compact">
                <label>
                  Abrir em
                  <select
                    value={deviceForm.initialMode}
                    onChange={(event) =>
                      setDeviceForm((current) => ({ ...current, initialMode: event.target.value }))
                    }
                  >
                    <option value="table">Mesa</option>
                    <option value="counter">Balcão</option>
                    <option value="bar">Bar</option>
                    <option value="cashier">Caixa</option>
                    <option value="kds">KDS</option>
                    <option value="expedition">Expedição</option>
                  </select>
                </label>
                <label>
                  Estação
                  <select
                    value={deviceForm.stationId}
                    onChange={(event) =>
                      setDeviceForm((current) => ({ ...current, stationId: event.target.value }))
                    }
                  >
                    <option value="">Não vinculada</option>
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Impressora de contingência
                  <select
                    value={deviceForm.printerDeviceId}
                    onChange={(event) =>
                      setDeviceForm((current) => ({
                        ...current,
                        printerDeviceId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Não vinculada</option>
                    {printers.map((printer) => (
                      <option key={printer.id} value={printer.id}>
                        {printer.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="check-line">
                <input
                  checked={deviceForm.allowModeSwitch}
                  onChange={(event) =>
                    setDeviceForm((current) => ({
                      ...current,
                      allowModeSwitch: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Permitir troca de modo neste terminal
              </label>
              <p className="muted-copy">
                KDS e expedição só são ativados com categoria, estação e rota térmica de
                contingência.
              </p>
              <button
                className="button secondary compact"
                type="button"
                disabled={busy}
                onClick={() => void addDevice()}
              >
                <Plus size={15} /> Registrar dispositivo
              </button>
              <label>
                Token de ativação deste terminal
                <input
                  value={deviceToken}
                  onChange={(event) => setDeviceToken(event.target.value)}
                  placeholder="Cole o token exibido no cadastro"
                  autoComplete="off"
                />
              </label>
              <button
                className="button primary compact"
                type="button"
                disabled={busy || deviceToken.trim().length < 16}
                onClick={() =>
                  void activateOperationalDevice(deviceToken.trim())
                    .then((device) => {
                      setDeviceToken("");
                      setMessage(`${device.name} ativado neste navegador.`);
                    })
                    .catch((error) =>
                      setMessage(
                        error instanceof Error ? error.message : "Falha ao ativar dispositivo.",
                      ),
                    )
                }
              >
                <CheckCircle2 size={15} /> Ativar neste navegador
              </button>
            </div>
            <div className="floor-entry-list">
              {devices.map((device) => (
                <div className="floor-entry" key={device.id}>
                  <div>
                    <strong>{device.name}</strong>
                    <small>
                      {device.kind} · abre em {device.initialMode} · {device.kdsInput}
                      {device.allowModeSwitch ? " · troca liberada" : ""} ·{" "}
                      {device.status === "active" ? "ativo" : "revogado"}
                    </small>
                  </div>
                  {device.status === "active" ? (
                    <button
                      className="button ghost compact"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void revokeOperationalDevice(device.id)
                          .then(() => {
                            setDevices((current) =>
                              current.map((item) =>
                                item.id === device.id ? { ...item, status: "revoked" } : item,
                              ),
                            );
                            setMessage("Dispositivo revogado.");
                          })
                          .catch((error) =>
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "Falha ao revogar dispositivo.",
                            ),
                          )
                      }
                    >
                      Revogar
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <ApprovalPinDialog
        open={Boolean(decision)}
        title={decision?.kind === "approve" ? "Aprovar solicitação" : "Rejeitar solicitação"}
        description="A decisão é auditada e o PIN não é armazenado nem exibido."
        confirmLabel={decision?.kind === "approve" ? "Aprovar agora" : "Rejeitar agora"}
        busy={busy}
        error={dialogError}
        onClose={() => {
          setDecision(null);
          setDialogError(null);
        }}
        onConfirm={confirmDecision}
      />
    </main>
  );
}
