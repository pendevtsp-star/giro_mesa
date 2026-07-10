"use client";

import { ArrowLeft, KeyRound, Link2, ShieldCheck, ShieldEllipsis, Unlink2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type AuditEvent,
  apiBaseUrl,
  changePassword,
  configureMfa,
  getSession,
  type LinkedOauthAccount,
  listAuditEvents,
  listLinkedOauthAccounts,
  listUsers,
  regenerateMfaRecoveryCodes,
  setupMfa,
  type TenantUser,
  unlinkGoogleAccount,
  verifyMfa,
} from "../../../lib/giromesa-api";

export default function SecurityPage() {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [oauthAccounts, setOauthAccounts] = useState<LinkedOauthAccount[]>([]);
  const [setup, setSetup] = useState<{
    manualKey: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [status, setStatus] = useState("Carregando seguranca...");
  const [isBusy, setIsBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  const currentUser = users.find((user) => user.id === sessionUserId) ?? users[0];
  const googleAccount = oauthAccounts.find((account) => account.provider === "google") ?? null;
  const googleLinkUrl = `${apiBaseUrl}/api/v1/auth/google/start?mode=link&returnTo=${encodeURIComponent("/app/security")}`;
  const securityChecklist = [
    {
      label: "MFA do usuario atual",
      done: Boolean(currentUser?.mfaEnabled),
      detail: currentUser?.mfaEnabled ? "Segundo fator ativo." : "Ativar antes de operacao real.",
    },
    {
      label: "Troca de senha auditada",
      done: events.some((event) => event.action === "password.changed"),
      detail: "Validar rotacao inicial da senha administrativa.",
    },
    {
      label: "Eventos de MFA auditados",
      done: events.some((event) => event.action === "mfa.enabled"),
      detail: "Confirmar trilha de auditoria antes de liberar perfis sensiveis.",
    },
    {
      label: "Metodo de acesso federado",
      done: Boolean(googleAccount),
      detail: googleAccount
        ? "Conta Google vinculada com trilha de auditoria."
        : "Opcional, mas recomendado para administradores e plataforma.",
    },
  ];
  const readinessScore = Math.round(
    (securityChecklist.filter((item) => item.done).length / securityChecklist.length) * 100,
  );

  const refresh = useCallback(async () => {
    const session = await getSession();
    const [usersResult, eventsResult, oauthResult] = await Promise.allSettled([
      listUsers(),
      listAuditEvents({ entityType: "user" }),
      listLinkedOauthAccounts(),
    ]);
    setSessionUserId(session.userId ?? null);
    setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
    setOauthAccounts(oauthResult.status === "fulfilled" ? oauthResult.value : []);
    const apiEvents = eventsResult.status === "fulfilled" ? eventsResult.value : [];
    setEvents(
      apiEvents.filter((event) =>
        [
          "mfa.setup_started",
          "mfa.enabled",
          "mfa.disabled",
          "password.changed",
          "auth.google_linked",
          "auth.google_unlinked",
          "auth.google_login",
          "auth.google_login_mfa_completed",
        ].includes(event.action),
      ),
    );
  }, []);

  useEffect(() => {
    refresh()
      .then(() => setStatus("Seguranca carregada."))
      .catch((error) => {
        const message =
          error instanceof ApiError && error.status === 401
            ? "Acesse o login para configurar seguranca."
            : "Nao foi possivel carregar seguranca.";
        setStatus(message);
      });
  }, [refresh]);

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao executar acao.");
    } finally {
      setIsBusy(false);
    }
  }

  function handlePasswordChange() {
    void runAction(async () => {
      await changePassword(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      await refresh();
      setStatus("Senha alterada com auditoria.");
    });
  }

  function handleStartMfa() {
    void runAction(async () => {
      const response = await setupMfa();
      setSetup(response);
      setStatus("Escaneie o otpauth ou copie a chave manual e confirme o codigo.");
    });
  }

  function handleVerifyMfa() {
    void runAction(async () => {
      const response = await verifyMfa(mfaCode);
      setSetup(null);
      setRecoveryCodes(response.recoveryCodes);
      setMfaCode("");
      await refresh();
      setStatus("MFA TOTP ativado. Guarde os codigos de recuperacao agora.");
    });
  }

  function handleDisableMfa() {
    void runAction(async () => {
      await configureMfa(false);
      setSetup(null);
      setRecoveryCodes([]);
      await refresh();
      setStatus("MFA desativado com auditoria.");
    });
  }

  function handleRegenerateRecoveryCodes() {
    void runAction(async () => {
      const response = await regenerateMfaRecoveryCodes(mfaCode);
      setRecoveryCodes(response.recoveryCodes);
      setMfaCode("");
      await refresh();
      setStatus("Novos codigos de recuperacao gerados. Guarde-os agora.");
    });
  }

  function handleUnlinkGoogle() {
    setOauthBusy(true);
    void unlinkGoogleAccount()
      .then(async () => {
        await refresh();
        setStatus("Conta Google desvinculada com auditoria.");
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Falha ao desvincular Google.");
      })
      .finally(() => setOauthBusy(false));
  }

  return (
    <main className="team-page">
      <header className="team-page-header">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <div>
          <span className="section-kicker">Seguranca</span>
          <h1>Conta e segundo fator</h1>
          <p>{status}</p>
        </div>
      </header>

      <section className="team-page-grid">
        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">MFA</span>
              <h2>Autenticador TOTP</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="team-form stacked">
            <div className="team-security-card">
              <strong>{currentUser?.name ?? "Usuario atual"}</strong>
              <span>{currentUser?.mfaEnabled ? "MFA ativo" : "MFA ainda nao confirmado"}</span>
            </div>
            {setup ? (
              <div className="secret-box">
                <Image
                  className="mfa-qr"
                  src={setup.qrCodeDataUrl}
                  alt="QR Code MFA GiroMesa"
                  width={180}
                  height={180}
                  unoptimized
                />
                <strong>Chave manual</strong>
                <code>{setup.manualKey}</code>
                <span>{setup.otpauthUrl}</span>
              </div>
            ) : null}
            {recoveryCodes.length > 0 ? (
              <div className="secret-box">
                <strong>Codigos de recuperacao</strong>
                <span>Use cada codigo apenas uma vez caso perca acesso ao autenticador.</span>
                <div className="recovery-code-grid">
                  {recoveryCodes.map((recoveryCode) => (
                    <code key={recoveryCode}>{recoveryCode}</code>
                  ))}
                </div>
              </div>
            ) : null}
            <label>
              Codigo do autenticador
              <input
                inputMode="numeric"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                placeholder="000000"
              />
            </label>
            <div className="team-row-actions">
              <button
                className="button secondary compact"
                type="button"
                onClick={handleStartMfa}
                disabled={isBusy}
              >
                <KeyRound size={16} /> Gerar chave
              </button>
              <button
                className="button primary compact"
                type="button"
                onClick={handleVerifyMfa}
                disabled={isBusy || !setup || mfaCode.length < 6}
              >
                Confirmar
              </button>
              <button
                className="button ghost compact"
                type="button"
                onClick={handleDisableMfa}
                disabled={isBusy || !currentUser?.mfaEnabled}
              >
                Desativar
              </button>
              <button
                className="button ghost compact"
                type="button"
                onClick={handleRegenerateRecoveryCodes}
                disabled={isBusy || !currentUser?.mfaEnabled || mfaCode.length < 6}
              >
                Gerar codigos
              </button>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Acesso federado</span>
              <h2>Google Sign-In</h2>
            </div>
            <ShieldEllipsis size={20} />
          </div>
          <div className="team-form stacked">
            <div className="team-security-card">
              <strong>
                {googleAccount ? "Conta Google vinculada" : "Conta Google ainda nao vinculada"}
              </strong>
              <span>
                {googleAccount?.email
                  ? googleAccount.email
                  : "Vincule para reduzir atrito de acesso e manter step-up MFA quando exigido."}
              </span>
            </div>
            <div className="status-list compact">
              <div className="status-row rich">
                <div>
                  <strong>Status do vinculo</strong>
                  <span>
                    {googleAccount
                      ? `Ultimo login registrado ${googleAccount.lastLoginAt ? new Date(googleAccount.lastLoginAt).toLocaleString("pt-BR") : "sem uso ainda"}.`
                      : "Fluxo pronto no backend; falta apenas a conta ser vinculada por este usuario."}
                  </span>
                </div>
                <span className={`gm-badge ${googleAccount ? "gm-badge-good" : "gm-badge-warn"}`}>
                  {googleAccount ? "vinculado" : "pendente"}
                </span>
              </div>
            </div>
            <div className="team-row-actions">
              <a className="button secondary compact" href={googleLinkUrl}>
                <Link2 size={16} /> {googleAccount ? "Religar Google" : "Vincular Google"}
              </a>
              <button
                className="button ghost compact"
                type="button"
                onClick={handleUnlinkGoogle}
                disabled={oauthBusy || !googleAccount}
              >
                <Unlink2 size={16} /> Desvincular
              </button>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Senha</span>
              <h2>Alterar senha</h2>
            </div>
            <KeyRound size={20} />
          </div>
          <div className="team-form stacked">
            <label>
              Senha atual
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    currentPassword: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
              />
            </label>
            <button
              className="button primary"
              type="button"
              onClick={handlePasswordChange}
              disabled={
                isBusy ||
                passwordForm.currentPassword.length < 8 ||
                passwordForm.newPassword.length < 8
              }
            >
              <ShieldCheck size={16} /> Trocar senha
            </button>
          </div>
        </article>

        <article className="panel roles-page-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Prontidao</span>
              <h2>Checklist de release</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="status-list">
            <div className="status-row rich">
              <div>
                <strong>Score atual</strong>
                <span>Base minima de seguranca para ambiente real.</span>
              </div>
              <small>{readinessScore}%</small>
            </div>
            {securityChecklist.map((item) => (
              <div className="status-row rich" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <span className={`gm-badge ${item.done ? "gm-badge-good" : "gm-badge-warn"}`}>
                  {item.done ? "ok" : "pendente"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel roles-page-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Auditoria</span>
              <h2>Eventos recentes</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="team-list">
            {events.slice(0, 8).map((event) => (
              <div className="team-row" key={event.id}>
                <div>
                  <strong>{event.action}</strong>
                  <span>{event.userEmail ?? event.userName ?? "Sistema"}</span>
                </div>
                <span>{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
