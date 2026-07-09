"use client";

import { ArrowLeft, KeyRound, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  assignUserRole,
  cancelInvitation,
  changePassword,
  configureMfa,
  createInvitation,
  type Invitation,
  listInvitations,
  listRoles,
  listUsers,
  type Role,
  resendInvitation,
  type TenantUser,
  updateRole,
} from "../../../lib/giromesa-api";

const permissionGroups = [
  ["tenant:manage", "Gerenciar tenant"],
  ["catalog:manage", "Gerenciar cardapio"],
  ["pos:operate", "Operar PDV"],
  ["pos:kds_send", "Enviar ao KDS"],
  ["pos:qr_review", "Conferir QR"],
  ["pos:payment_manage", "Receber pagamentos"],
  ["pos:close_order", "Fechar contas"],
  ["inventory:manage", "Gerenciar estoque"],
  ["fiscal:manage", "Gerenciar fiscal"],
  ["printing:manage", "Gerenciar impressao"],
  ["reports:read", "Acessar relatorios"],
] as const;

export default function TeamPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [invitationEmail, setInvitationEmail] = useState("gerente@bar.demo");
  const [invitationRoleId, setInvitationRoleId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserRoleId, setSelectedUserRoleId] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [status, setStatus] = useState("Carregando equipe...");
  const [isBusy, setIsBusy] = useState(false);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const currentUser =
    users.find((user) => user.email === "admin@bar-aurora-demo.local") ?? users[0];

  const refreshTeam = useCallback(async () => {
    const [apiRoles, apiUsers, apiInvitations] = await Promise.all([
      listRoles(),
      listUsers(),
      listInvitations(),
    ]);
    setRoles(apiRoles);
    setUsers(apiUsers);
    setInvitations(apiInvitations);
    setSelectedRoleId((current) => current || apiRoles[0]?.id || "");
    setInvitationRoleId((current) => current || apiRoles[0]?.id || "");
    setSelectedUserId((current) => current || apiUsers[0]?.id || "");
    setSelectedUserRoleId((current) => current || apiRoles[0]?.id || "");
  }, []);

  useEffect(() => {
    refreshTeam()
      .then(() => setStatus("Equipe carregada."))
      .catch((error) => {
        const message =
          error instanceof ApiError && error.status === 401
            ? "Acesse o login para administrar equipe."
            : "Nao foi possivel carregar equipe.";
        setStatus(message);
      });
  }, [refreshTeam]);

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

  function handleTogglePermission(permission: string) {
    if (!selectedRole) {
      return;
    }

    void runAction(async () => {
      const permissions = selectedRole.permissions.includes(permission)
        ? selectedRole.permissions.filter((entry) => entry !== permission)
        : [...selectedRole.permissions, permission];
      await updateRole(selectedRole.id, { permissions });
      await refreshTeam();
      setStatus("Permissao atualizada com auditoria.");
    });
  }

  function handleCreateInvitation() {
    void runAction(async () => {
      const invitation = await createInvitation({
        email: invitationEmail,
        roleId: invitationRoleId,
      });
      await refreshTeam();
      setStatus(
        invitation.acceptUrl
          ? `Convite criado. Link mock: ${invitation.acceptUrl}`
          : "Convite criado.",
      );
    });
  }

  function handleResendInvitation(invitationId: string) {
    void runAction(async () => {
      const invitation = await resendInvitation(invitationId);
      await refreshTeam();
      setStatus(
        invitation.acceptUrl
          ? `Convite reenviado. Link mock: ${invitation.acceptUrl}`
          : "Convite reenviado.",
      );
    });
  }

  function handleCancelInvitation(invitationId: string) {
    void runAction(async () => {
      await cancelInvitation(invitationId);
      await refreshTeam();
      setStatus("Convite cancelado.");
    });
  }

  function handleAssignRole() {
    void runAction(async () => {
      await assignUserRole(selectedUserId, { roleId: selectedUserRoleId });
      await refreshTeam();
      setStatus("Cargo aplicado ao usuario.");
    });
  }

  function handleChangePassword() {
    void runAction(async () => {
      await changePassword(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setStatus("Senha alterada com auditoria.");
    });
  }

  function handleDisableMfa() {
    void runAction(async () => {
      await configureMfa(false);
      await refreshTeam();
      setStatus("MFA desativado.");
    });
  }

  function userNeedsMfa(user: TenantUser) {
    return (
      !user.mfaEnabled &&
      user.roles.some((role) => ["owner", "manager", "finance"].includes(role.code))
    );
  }

  return (
    <main className="team-page">
      <header className="team-page-header">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Painel
        </a>
        <div>
          <span className="section-kicker">Equipe</span>
          <h1>Usuarios, convites e cargos</h1>
          <p>{status}</p>
        </div>
      </header>

      <section className="team-page-grid">
        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Convites</span>
              <h2>Novo acesso</h2>
            </div>
            <KeyRound size={20} />
          </div>
          <div className="team-form stacked">
            <label>
              E-mail
              <input
                value={invitationEmail}
                onChange={(event) => setInvitationEmail(event.target.value)}
              />
            </label>
            <label>
              Cargo
              <select
                value={invitationRoleId}
                onChange={(event) => setInvitationRoleId(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button primary"
              type="button"
              onClick={handleCreateInvitation}
              disabled={isBusy}
            >
              <KeyRound size={16} /> Criar convite
            </button>
          </div>
          <div className="team-list">
            {invitations.map((invitation) => (
              <div className="team-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <span>
                    {invitation.roleName ?? "Sem cargo"} - {invitation.status}
                  </span>
                  {invitation.acceptUrl ? <code>{invitation.acceptUrl}</code> : null}
                </div>
                <div className="team-row-actions">
                  <button
                    className="button secondary compact"
                    type="button"
                    onClick={() => handleResendInvitation(invitation.id)}
                    disabled={isBusy || invitation.status === "accepted"}
                  >
                    Reenviar
                  </button>
                  <button
                    className="button ghost compact"
                    type="button"
                    onClick={() => handleCancelInvitation(invitation.id)}
                    disabled={isBusy || invitation.status === "accepted"}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Usuarios</span>
              <h2>Atribuir cargo</h2>
            </div>
            <Users size={20} />
          </div>
          <div className="team-form stacked">
            <label>
              Usuario
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cargo
              <select
                value={selectedUserRoleId}
                onChange={(event) => setSelectedUserRoleId(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={handleAssignRole}
              disabled={isBusy}
            >
              <ShieldCheck size={16} /> Aplicar cargo
            </button>
          </div>
          <div className="team-list">
            {users.map((user) => (
              <div className="team-row" key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                  <small>
                    {user.mfaEnabled
                      ? "MFA ativo"
                      : userNeedsMfa(user)
                        ? "MFA recomendado"
                        : "MFA opcional"}
                  </small>
                </div>
                <span>{user.roles[0]?.name ?? "sem cargo"}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Seguranca</span>
              <h2>Senha e MFA</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="team-form stacked">
            <div className="team-security-card">
              <strong>{selectedUser?.name ?? "Usuario"}</strong>
              <span>
                {selectedUser?.mfaEnabled
                  ? "Segundo fator ativo no mock local."
                  : "Segundo fator pendente para perfis sensiveis."}
              </span>
              <div className="team-row-actions">
                <button
                  className="button secondary compact"
                  type="button"
                  onClick={() => {
                    window.location.href = "/app/security";
                  }}
                  disabled={isBusy || currentUser?.mfaEnabled}
                >
                  Configurar MFA
                </button>
                <button
                  className="button ghost compact"
                  type="button"
                  onClick={handleDisableMfa}
                  disabled={isBusy || !currentUser?.mfaEnabled}
                >
                  Desativar
                </button>
              </div>
            </div>
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
              onClick={handleChangePassword}
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
              <span className="section-kicker">Cargos</span>
              <h2>Permissoes</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="role-shell">
            <div className="role-list">
              {roles.map((role) => (
                <button
                  className={`role-chip ${role.id === selectedRole?.id ? "selected" : ""}`}
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                >
                  <strong>{role.name}</strong>
                  <span>{role.permissions.length} permissoes</span>
                </button>
              ))}
            </div>
            <div className="permission-card">
              <div className="permission-groups">
                {permissionGroups.map(([permission, label]) => (
                  <label className="permission-toggle" key={permission}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedRole?.permissions.includes(permission))}
                      onChange={() => handleTogglePermission(permission)}
                      disabled={isBusy || !selectedRole}
                    />
                    <span>{label}</span>
                    <code>{permission}</code>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
