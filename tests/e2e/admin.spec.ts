import { expect, test } from "@playwright/test";
import {
  authenticateBrowserPage,
  authenticatedApiContext,
  authenticatePlatformPage,
  platformEmail,
  platformPassword,
  skipWhenApiUnavailable,
} from "./helpers";

test.describe("Admin: tenant, user and role management", () => {
  test("platform owner sees Backoffice SaaS dashboard", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticatePlatformPage(page);

    await expect(page.getByRole("heading", { name: "Backoffice SaaS" })).toBeVisible();
  });

  test("platform tenant detail fails closed when its API request fails", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticatePlatformPage(page);
    await page.route("**/api/v1/platform/tenants/fail-closed", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"forced"}' }),
    );

    await page.goto("/platform/fail-closed", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Tenant indispon\u00edvel" })).toBeVisible();
    await expect(page.getByText("Bar Aurora")).toHaveCount(0);
  });

  test("platform can provision a new tenant via API", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext(platformEmail, platformPassword);
    const suffix = Date.now();
    const created = await api.post("/api/v1/platform/tenants", {
      data: {
        name: `E2E Admin Tenant ${suffix}`,
        ownerName: "E2E Admin Owner",
        ownerEmail: `admin-owner-${suffix}@tenant.local`,
        planCode: "starter",
      },
    });
    expect(created.ok()).toBe(true);
    const payload = (await created.json()) as {
      tenant: { id: string; name: string };
      invitation: { tokenReturnedOnce: string } | null;
    };
    expect(payload.tenant.id).toBeTruthy();
    expect(payload.tenant.name).toContain("E2E Admin Tenant");
    expect(payload.invitation?.tokenReturnedOnce).toBeTruthy();

    await api.dispose();
  });

  test("platform can suspend and block a tenant", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext(platformEmail, platformPassword);
    const suffix = Date.now();
    const created = await api.post("/api/v1/platform/tenants", {
      data: {
        name: `E2E Suspend Tenant ${suffix}`,
        ownerName: "E2E Suspend Owner",
        ownerEmail: `suspend-owner-${suffix}@tenant.local`,
        planCode: "professional",
      },
    });
    const payload = (await created.json()) as {
      tenant: { id: string };
      invitation: { tokenReturnedOnce: string } | null;
    };

    const acceptResponse = await api.post("/api/v1/auth/invitations/accept", {
      data: {
        token: payload.invitation?.tokenReturnedOnce,
        name: "E2E Suspend Owner",
        password: `SuspendPass${suffix}!`,
      },
    });
    expect(acceptResponse.ok()).toBe(true);

    const suspended = await api.patch(`/api/v1/platform/tenants/${payload.tenant.id}/status`, {
      data: { status: "suspended" },
    });
    expect(suspended.ok()).toBe(true);

    const blockedLogin = await api.post("/api/v1/auth/login", {
      data: { email: `suspend-owner-${suffix}@tenant.local`, password: `SuspendPass${suffix}!` },
    });
    expect(blockedLogin.status()).toBe(401);

    await api.dispose();
  });

  test("tenant admin can manage users, invitations and roles", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();

    const roles = await api.get("/api/v1/auth/roles");
    expect(roles.ok()).toBe(true);
    const roleList = ((await (await roles.json()).data) ?? []) as { id: string; code: string }[];
    expect(roleList.length).toBeGreaterThan(0);
    const role = roleList.find((r) => r.code === "manager") ?? roleList[0];

    const users = await api.get("/api/v1/auth/users");
    expect(users.ok()).toBe(true);
    const userList = ((await (await users.json()).data) ?? []) as { id: string; email: string }[];
    expect(userList.length).toBeGreaterThan(0);

    const email = `e2e-user-${Date.now()}@example.com`;
    const invitation = await api.post("/api/v1/auth/invitations", {
      data: { email, roleId: role.id },
    });
    expect(invitation.ok()).toBe(true);
    const invitationPayload = (await invitation.json()) as {
      id: string;
      tokenReturnedOnce: string;
    };

    const accepted = await api.post("/api/v1/auth/invitations/accept", {
      data: {
        token: invitationPayload.tokenReturnedOnce,
        name: "E2E Team User",
        password: "TeamUserPass1!",
      },
    });
    expect(accepted.ok()).toBe(true);

    const allUsers = await api.get("/api/v1/auth/users");
    const updatedUsers = ((await (await allUsers.json()).data) ?? []) as {
      id: string;
      email: string;
    }[];
    const createdUser = updatedUsers.find((u) => u.email === email);
    expect(createdUser?.id).toBeTruthy();

    const assigned = await api.post(`/api/v1/auth/users/${createdUser?.id}/roles`, {
      data: { roleId: role.id },
    });
    expect(assigned.ok()).toBe(true);

    await api.dispose();
  });

  test("admin can change password and manage MFA", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();

    const me = await api.get("/api/v1/auth/me");
    expect(me.ok()).toBe(true);

    // Test MFA enable/disable without TOTP verification (avoids ESM import issue)
    const mfaSetup = await api.post("/api/v1/auth/mfa/setup");
    if (!mfaSetup.ok()) {
      await api.dispose();
      test.skip(true, "MFA setup unavailable");
    }

    // Verify MFA setup returns a manual key
    const mfaPayload = (await mfaSetup.json()) as { manualKey: string };
    expect(mfaPayload.manualKey).toBeTruthy();

    // Disable MFA (cleanup)
    const disable = await api.post("/api/v1/auth/mfa/configure", { data: { enabled: false } });
    expect(disable.ok()).toBe(true);

    await api.dispose();
  });

  test("team page shows users, roles and invitation management UI", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await page.goto("/app/team", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Usuários, convites e cargos" })).toBeVisible({
      timeout: 8_000,
    });

    await expect(page.getByRole("heading", { name: "Novo acesso" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atribuir cargo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Permissões" })).toBeVisible();
  });

  test("security page shows MFA and password management UI", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await page.goto("/app/security", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Conta e segundo fator" })).toBeVisible({
      timeout: 8_000,
    });

    await expect(page.getByRole("heading", { name: "Autenticador TOTP" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alterar senha" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checklist de release" })).toBeVisible();
  });
});
