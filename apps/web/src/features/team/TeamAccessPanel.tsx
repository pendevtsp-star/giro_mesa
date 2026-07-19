"use client";

import { Badge } from "@giromesa/ui";
import { KeyRound, ShieldCheck, Users } from "lucide-react";
import type { Invitation, Role, TenantUser } from "../../lib/giromesa-api";

type InvitationForm = { email: string; roleId: string };
type UserRoleForm = { userId: string; roleId: string };

type TeamAccessPanelProps = {
  roles: Role[];
  users: TenantUser[];
  invitations: Invitation[];
  selectedRole: Role | null;
  permissionGroups: ReadonlyArray<{
    title: string;
    items: ReadonlyArray<readonly [string, string]>;
  }>;
  selectedRoleId: string;
  invitationForm: InvitationForm;
  userRoleForm: UserRoleForm;
  isBusy: boolean;
  onSelectedRoleChange: (roleId: string) => void;
  onInvitationFormChange: (updater: (current: InvitationForm) => InvitationForm) => void;
  onUserRoleFormChange: (updater: (current: UserRoleForm) => UserRoleForm) => void;
  onTogglePermission: (role: Role, permission: string) => void;
  onCreateInvitation: () => void;
  onAssignUserRole: () => void;
};

export function TeamAccessPanel({
  roles,
  users,
  invitations,
  selectedRole,
  permissionGroups,
  selectedRoleId,
  invitationForm,
  userRoleForm,
  isBusy,
  onSelectedRoleChange,
  onInvitationFormChange,
  onUserRoleFormChange,
  onTogglePermission,
  onCreateInvitation,
  onAssignUserRole,
}: TeamAccessPanelProps) {
  return (
    <>
      <article className="panel permissions-panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">Permissões</span>
            <h2>Cargos e acessos</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="role-shell">
          <div className="role-list">
            {roles.map((role) => (
              <button
                className={`role-chip ${role.id === selectedRoleId ? "selected" : ""}`}
                key={role.id}
                type="button"
                onClick={() => onSelectedRoleChange(role.id)}
              >
                <strong>{role.name}</strong>
                <span>{role.permissions.length} permissões</span>
              </button>
            ))}
          </div>
          <div className="permission-card">
            {selectedRole ? (
              <>
                <div className="permission-head">
                  <div>
                    <strong>{selectedRole.name}</strong>
                    <span>{selectedRole.code}</span>
                  </div>
                  <Badge tone="info">{selectedRole.permissions.length} ativas</Badge>
                </div>
                <div className="permission-groups">
                  {permissionGroups.map((group) => (
                    <div className="permission-group" key={group.title}>
                      <span>{group.title}</span>
                      {group.items.map(([permission, label]) => (
                        <label className="permission-toggle" key={permission}>
                          <input
                            type="checkbox"
                            checked={selectedRole.permissions.includes(permission)}
                            onChange={() => onTogglePermission(selectedRole, permission)}
                            disabled={isBusy}
                          />
                          <span>{label}</span>
                          <code>{permission}</code>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <strong>Nenhum cargo encontrado</strong>
                <span>Cadastre ou sincronize cargos para configurar o RBAC.</span>
              </div>
            )}
          </div>
        </div>
      </article>

      <article className="panel team-panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">Equipe</span>
            <h2>Usuários e convites</h2>
          </div>
          <div className="team-row-actions">
            <a className="button ghost compact" href="/app/security">
              <ShieldCheck size={15} /> Segurança
            </a>
            <a className="button ghost compact" href="/app/team">
              <Users size={15} /> Abrir
            </a>
          </div>
        </div>
        <div className="team-forms">
          <form
            className="team-form"
            onSubmit={(event) => {
              event.preventDefault();
              onCreateInvitation();
            }}
          >
            <label>
              E-mail do convite
              <input
                type="email"
                value={invitationForm.email}
                onChange={(event) =>
                  onInvitationFormChange((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Cargo
              <select
                value={invitationForm.roleId}
                onChange={(event) =>
                  onInvitationFormChange((current) => ({
                    ...current,
                    roleId: event.target.value,
                  }))
                }
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary compact" type="submit" disabled={isBusy}>
              <KeyRound size={15} /> Convidar
            </button>
          </form>
          <form
            className="team-form"
            onSubmit={(event) => {
              event.preventDefault();
              onAssignUserRole();
            }}
          >
            <label>
              Usuário
              <select
                value={userRoleForm.userId}
                onChange={(event) =>
                  onUserRoleFormChange((current) => ({
                    ...current,
                    userId: event.target.value,
                  }))
                }
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Novo cargo
              <select
                value={userRoleForm.roleId}
                onChange={(event) =>
                  onUserRoleFormChange((current) => ({
                    ...current,
                    roleId: event.target.value,
                  }))
                }
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary compact" type="submit" disabled={isBusy}>
              <ShieldCheck size={15} /> Aplicar
            </button>
          </form>
        </div>
        <div className="team-list">
          {users.slice(0, 4).map((user) => (
            <div className="team-row" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <Badge tone={user.isActive ? "good" : "danger"}>
                {user.roles[0]?.name ?? "sem cargo"}
              </Badge>
            </div>
          ))}
          {invitations.slice(0, 3).map((invitation) => (
            <div className="team-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <span>Convite para {invitation.roleName ?? "cargo pendente"}</span>
              </div>
              <Badge tone={invitation.status === "pending" ? "warn" : "neutral"}>
                {invitation.status}
              </Badge>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}
