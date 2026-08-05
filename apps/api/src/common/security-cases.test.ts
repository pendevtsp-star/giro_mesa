import { escapeHtml } from "@giromesa/domain";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertSupportAccess, type SupportGrant } from "../modules/platform/support-access";
import { createCsrfToken, verifyCsrfToken } from "./csrf";
import { assertSafeOutboundUrl, assertSafeRedirect } from "./outbound-url";
import { rejectTenantOverride } from "./security";
import {
  signWebhookPayload,
  verifyRawBodyHmacSignature,
  verifyWebhookSignature,
} from "./webhook-signature";

const context = {
  tenantId: "platform",
  userId: "actor-a",
  requestId: "req-1",
  permissions: ["platform:manage"],
};
const grant: SupportGrant = {
  id: "grant-a",
  tenantId: "tenant-a",
  branchId: "branch-a",
  resource: "operations",
  actions: ["read"],
  mode: "read_only",
  reason: "diagnostic",
  createdBy: "actor-a",
  createdAt: "2026-08-04T20:00:00.000Z",
  expiresAt: "2026-08-05T04:00:00.000Z",
  revokedAt: null,
};

describe("executable security cases", () => {
  it("blocks tenant and branch IDOR", () => {
    expect(() => rejectTenantOverride({ nested: { tenantId: "tenant-b" } })).toThrow(
      BadRequestException,
    );
    for (const scope of [
      { tenantId: "tenant-b", branchId: "branch-a" },
      { tenantId: "tenant-a", branchId: "branch-b" },
    ]) {
      expect(() =>
        assertSupportAccess({
          settings: { supportGrants: [grant] },
          context,
          ...scope,
          resource: "operations",
          action: "read",
          now: new Date("2026-08-05T00:00:00.000Z"),
        }),
      ).toThrow(ForbiddenException);
    }
  });

  it("rejects expired, revoked and read-only mutation grants", () => {
    const checks: SupportGrant[] = [
      { ...grant, expiresAt: "2026-08-04T23:59:59.000Z" },
      { ...grant, revokedAt: "2026-08-04T23:00:00.000Z" },
      { ...grant, actions: ["read", "mutate"], mode: "read_only" },
    ];
    for (const candidate of checks) {
      expect(() =>
        assertSupportAccess({
          settings: { supportGrants: [candidate] },
          context,
          tenantId: "tenant-a",
          branchId: "branch-a",
          resource: "operations",
          action: candidate.actions.includes("mutate") ? "mutate" : "read",
          now: new Date("2026-08-05T00:00:00.000Z"),
        }),
      ).toThrow(ForbiddenException);
    }
  });

  it("rejects absent and invalid CSRF and accepts the bound token", () => {
    const token = createCsrfToken("session-a", "csrf-secret");
    expect(
      verifyCsrfToken({ token: undefined, sessionToken: "session-a", secret: "csrf-secret" }),
    ).toBe(false);
    expect(verifyCsrfToken({ token, sessionToken: "session-b", secret: "csrf-secret" })).toBe(
      false,
    );
    expect(verifyCsrfToken({ token, sessionToken: "session-a", secret: "csrf-secret" })).toBe(true);
  });

  it("neutralizes XSS in rendered output", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("blocks loopback, private, link-local, redirect and DNS rebinding SSRF", async () => {
    const publicDns = async () => ["203.0.113.10"];
    for (const url of [
      "https://127.0.0.1/a",
      "https://10.0.0.1/a",
      "https://169.254.169.254/a",
      "https://[::1]/a",
    ]) {
      await expect(assertSafeOutboundUrl(url, publicDns)).rejects.toThrow(BadRequestException);
    }
    await expect(
      assertSafeOutboundUrl("https://safe.example/a", async () => ["203.0.113.10", "10.0.0.2"]),
    ).rejects.toThrow(BadRequestException);
    await expect(
      assertSafeRedirect("https://safe.example/a", "https://127.0.0.1/admin", publicDns),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects replay and absent/invalid HMAC while validating raw body", () => {
    const rawBody = Buffer.from('{"amount":10}');
    const timestamp = "2026-08-05T00:00:00.000Z";
    const signature = signWebhookPayload({
      secret: "hmac-secret",
      timestamp,
      eventId: "evt-1",
      rawBody,
    });
    expect(
      verifyWebhookSignature({
        secret: "hmac-secret",
        signature,
        timestamp,
        eventId: "evt-1",
        rawBody,
        nowMs: Date.parse(timestamp),
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret: "hmac-secret",
        signature,
        timestamp,
        eventId: "evt-1",
        rawBody,
        nowMs: Date.parse(timestamp) + 301_000,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret: "hmac-secret",
        signature: undefined,
        timestamp,
        eventId: "evt-1",
        rawBody,
      }),
    ).toBe(false);
    expect(
      verifyRawBodyHmacSignature({ secret: "hmac-secret", signature: "sha256=invalid", rawBody }),
    ).toBe(false);
    expect(
      verifyRawBodyHmacSignature({
        secret: "hmac-secret",
        signature: `sha256=${Buffer.from("invalid").toString("hex")}`,
        rawBody: Buffer.from('{"amount":11}'),
      }),
    ).toBe(false);
  });
});
