import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { rejectTenantOverride, requirePermission } from "./security";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  requestId: "request-a",
  permissions: ["catalog:manage"],
};

const operationalPermissionMatrix = {
  owner: [
    "pos:operate",
    "pos:qr_review",
    "pos:kds_send",
    "pos:payment_manage",
    "pos:close_order",
    "kds:operate",
    "approvals:manage",
    "inventory:manage",
    "reports:read",
  ],
  manager: [
    "pos:operate",
    "pos:qr_review",
    "pos:kds_send",
    "pos:payment_manage",
    "pos:close_order",
    "kds:operate",
    "approvals:manage",
    "inventory:manage",
    "reports:read",
  ],
  cashier: [
    "pos:operate",
    "pos:qr_review",
    "pos:payment_manage",
    "pos:close_order",
    "reports:read",
  ],
  waiter: ["pos:operate", "pos:qr_review", "pos:kds_send"],
  kitchen: ["kds:operate"],
  finance: ["reports:read"],
} as const;

type OperationalRole = keyof typeof operationalPermissionMatrix;

function contextFor(role: OperationalRole) {
  return {
    ...context,
    permissions: [...operationalPermissionMatrix[role]],
  };
}

describe("security guardrails", () => {
  it("allows requests with the required backend permission", () => {
    expect(() => requirePermission(context, "catalog:manage")).not.toThrow();
  });

  it("throws 403 when a backend permission is missing", () => {
    expect(() => requirePermission(context, "cash:manage")).toThrow(ForbiddenException);
  });

  it.each([
    ["waiter", "pos:payment_manage"],
    ["waiter", "pos:close_order"],
    ["waiter", "kds:operate"],
    ["waiter", "approvals:manage"],
    ["waiter", "inventory:manage"],
    ["waiter", "reports:read"],
    ["cashier", "pos:kds_send"],
    ["cashier", "kds:operate"],
    ["cashier", "approvals:manage"],
    ["cashier", "inventory:manage"],
    ["kitchen", "pos:operate"],
    ["kitchen", "pos:qr_review"],
    ["kitchen", "pos:payment_manage"],
    ["finance", "pos:operate"],
    ["finance", "pos:close_order"],
    ["finance", "inventory:manage"],
  ] satisfies Array<[OperationalRole, string]>)("denies %s access to %s", (role, permission) => {
    expect(() => requirePermission(contextFor(role), permission)).toThrow(ForbiddenException);
  });

  it.each([
    ["owner", "pos:payment_manage"],
    ["owner", "pos:close_order"],
    ["owner", "kds:operate"],
    ["owner", "approvals:manage"],
    ["owner", "inventory:manage"],
    ["owner", "reports:read"],
    ["manager", "pos:qr_review"],
    ["manager", "approvals:manage"],
    ["cashier", "pos:payment_manage"],
    ["cashier", "pos:close_order"],
    ["waiter", "pos:kds_send"],
    ["waiter", "pos:qr_review"],
    ["kitchen", "kds:operate"],
    ["finance", "reports:read"],
  ] satisfies Array<[OperationalRole, string]>)("allows %s access to %s", (role, permission) => {
    expect(() => requirePermission(contextFor(role), permission)).not.toThrow();
  });

  it("does not treat pos:operate as an alias for sensitive POS permissions", () => {
    const operatorContext = { ...context, permissions: ["pos:operate"] };

    for (const permission of [
      "pos:qr_review",
      "pos:kds_send",
      "pos:payment_manage",
      "pos:close_order",
    ]) {
      expect(() => requirePermission(operatorContext, permission)).toThrow(ForbiddenException);
    }
  });

  it("does not let a specialized POS permission imply general POS operation", () => {
    expect(() =>
      requirePermission({ ...context, permissions: ["pos:payment_manage"] }, "pos:operate"),
    ).toThrow(ForbiddenException);
  });

  it("rejects tenant overrides sent by private endpoint clients", () => {
    expect(() => rejectTenantOverride({ tenantId: "tenant-b", name: "Produto" })).toThrow(
      BadRequestException,
    );
    expect(() => rejectTenantOverride({ tenant_id: "tenant-b", name: "Produto" })).toThrow(
      BadRequestException,
    );
  });

  it("rejects tenant overrides nested inside request payloads", () => {
    expect(() =>
      rejectTenantOverride({
        customer: { name: "Cliente", tenantId: "tenant-b" },
        items: [{ productId: "product-a", tenant_id: "tenant-b" }],
      }),
    ).toThrow(BadRequestException);
  });

  it("allows ordinary request bodies without tenant hints", () => {
    expect(() => rejectTenantOverride({ name: "Produto", priceCents: 3200 })).not.toThrow();
  });
});
