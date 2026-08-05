import type { TenantContext } from "@giromesa/domain";
import { ForbiddenException } from "@nestjs/common";

export type SupportResource = "operations" | "integrations" | "audit";
export type SupportAction = "read" | "mutate";
export type SupportGrant = {
  id: string;
  tenantId: string;
  branchId: string | null;
  resource: SupportResource;
  actions: SupportAction[];
  mode: "read_only" | "elevated";
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export function readSupportGrants(settings: Record<string, unknown>): SupportGrant[] {
  if (!Array.isArray(settings.supportGrants)) return [];
  return settings.supportGrants.filter(isSupportGrant).slice(-50);
}

export function assertSupportAccess(input: {
  settings: Record<string, unknown>;
  context: TenantContext;
  tenantId: string;
  branchId: string | null;
  resource: SupportResource;
  action: SupportAction;
  now?: Date;
}) {
  const actorId = input.context.userId;
  const now = (input.now ?? new Date()).getTime();
  const grant = readSupportGrants(input.settings)
    .filter(
      (candidate) =>
        candidate.tenantId === input.tenantId &&
        candidate.createdBy === actorId &&
        candidate.branchId === input.branchId &&
        candidate.resource === input.resource &&
        candidate.revokedAt === null &&
        new Date(candidate.expiresAt).getTime() > now &&
        candidate.actions.includes(input.action),
    )
    .at(-1);
  if (!grant || (input.action === "mutate" && grant.mode !== "elevated")) {
    throw new ForbiddenException("No active scoped support grant");
  }
  return grant;
}

function isSupportGrant(value: unknown): value is SupportGrant {
  if (!value || typeof value !== "object") return false;
  const grant = value as Partial<SupportGrant>;
  return (
    typeof grant.id === "string" &&
    typeof grant.tenantId === "string" &&
    (grant.branchId === null || typeof grant.branchId === "string") &&
    (grant.resource === "operations" ||
      grant.resource === "integrations" ||
      grant.resource === "audit") &&
    Array.isArray(grant.actions) &&
    grant.actions.every((action) => action === "read" || action === "mutate") &&
    (grant.mode === "read_only" || grant.mode === "elevated") &&
    typeof grant.createdBy === "string" &&
    typeof grant.expiresAt === "string" &&
    (grant.revokedAt === null || typeof grant.revokedAt === "string")
  );
}
