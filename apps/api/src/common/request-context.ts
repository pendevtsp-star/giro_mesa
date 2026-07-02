import { randomUUID } from "node:crypto";
import type { TenantContext } from "@giromesa/domain";

type HeaderValue = string | string[] | undefined;

function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveTenantContext(headers: Record<string, HeaderValue>): TenantContext {
  const requestId = firstHeader(headers["x-request-id"]) ?? randomUUID();
  const tenantId = firstHeader(headers["x-tenant-id"]) ?? "demo-tenant";
  const branchId = firstHeader(headers["x-branch-id"]);
  const userId = firstHeader(headers["x-user-id"]) ?? "demo-user";
  const permissions = (
    firstHeader(headers["x-permissions"]) ?? "platform:read,tenant:manage,pos:operate"
  )
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);

  return {
    tenantId,
    userId,
    requestId,
    permissions,
    ...(branchId ? { branchId } : {}),
  };
}

export function requirePermission(context: TenantContext, permission: string): void {
  if (!context.permissions.includes(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
