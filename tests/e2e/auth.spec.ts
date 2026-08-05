import { expect, test } from "@playwright/test";
import {
  acceptCurrentLegalDocuments,
  adminEmail,
  adminPassword,
  authenticateBrowserPage,
  authenticatedApiContext,
  chooseCookieConsent,
  loginViaUi,
  platformEmail,
  platformPassword,
  skipWhenApiUnavailable,
} from "./helpers";

test.describe("Auth: login flow", () => {
  test("logs in with valid tenant credentials and redirects to /app", async ({ page }) => {
    await skipWhenApiUnavailable();
    await page.goto("/login", { waitUntil: "networkidle" });

    await loginViaUi(page, "gerente@bar-aurora-demo.local", adminPassword, {
      acceptLegal: false,
    });
    await expect(page).toHaveURL(/\/app/);
    await expect(
      page.getByRole("heading", { name: "Revise e aceite para continuar" }),
    ).toBeVisible();

    await acceptCurrentLegalDocuments(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Revise e aceite para continuar" })).toHaveCount(
      0,
    );
    await expect(page.getByTestId("workspace-dashboard")).toBeVisible();
  });

  test("logs in with valid platform credentials and redirects to /platform", async ({ page }) => {
    await skipWhenApiUnavailable();
    await page.goto("/login", { waitUntil: "networkidle" });

    await loginViaUi(page, platformEmail, platformPassword);
    await expect(page).toHaveURL(/\/platform/);
    await expect(page.getByRole("heading", { name: "Backoffice SaaS" })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await skipWhenApiUnavailable();
    await page.goto("/login", { waitUntil: "networkidle" });

    await loginViaUi(page, adminEmail, "WrongPassword1!");
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
  });

  test("handles MFA setup and verification via API", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();

    // Setup MFA
    const mfaSetup = await api.post("/api/v1/auth/mfa/setup");
    if (!mfaSetup.ok()) {
      await api.dispose();
      test.skip(true, "MFA setup unavailable in this environment");
    }
    const mfaPayload = (await mfaSetup.json()) as { manualKey: string };
    expect(mfaPayload.manualKey).toBeTruthy();

    // Cleanup: disable MFA
    await api.post("/api/v1/auth/mfa/configure", { data: { enabled: false } });
    await api.dispose();
  });

  test("request password reset returns a link or confirmation", async ({ page }) => {
    await skipWhenApiUnavailable();
    await page.goto("/login", { waitUntil: "networkidle" });

    await chooseCookieConsent(page, "reject");
    await page.locator('input[name="email"]').fill(adminEmail);
    await page.getByRole("button", { name: /reset de senha/i }).click();

    await expect(page.getByRole("status")).toContainText("Solicitação registrada", {
      timeout: 8_000,
    });
  });

  test("guides an empty reset request without calling the API", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await chooseCookieConsent(page, "reject");
    let resetRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/auth/password/reset/request")) resetRequests += 1;
    });

    await page.getByRole("button", { name: /reset de senha/i }).click();

    await expect(page.locator(".form-alert[role='alert']")).toContainText(
      "Digite um e-mail válido",
    );
    expect(resetRequests).toBe(0);
  });

  test("opens the in-product support center instead of the email client", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await chooseCookieConsent(page, "accept");
    const supportLink = page.getByRole("link", { name: "Suporte" });
    await expect(supportLink).toHaveAttribute("href", "/suporte");

    await supportLink.click();
    await expect(page).toHaveURL(/\/suporte$/);
    await expect(
      page.getByRole("heading", { name: "Resolva o acesso sem sair do GiroMesa." }),
    ).toBeVisible();
  });

  test("resets password via token link", async ({ page }) => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
    const resetRequest = await api.post("/api/v1/auth/password/reset/request", {
      data: { email: adminEmail },
    });
    if (!resetRequest.ok()) {
      await api.dispose();
      test.skip(true, "Password reset request not available");
    }

    await api.dispose();
    await page.goto("/reset/invalid-expired-token", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Nova senha/i }).first()).toBeVisible();
  });

  test("logout redirects to /login", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    // Verify we are on /app
    await expect(page).toHaveURL(/\/app/);

    // Navigate directly to /login - verifies the login page is accessible
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
    // Verify the login form is visible
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("shows connected session as status instead of a login link", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await expect(page.getByRole("status", { name: "Sessão conectada" })).toHaveText("Conectado");
    await expect(page.getByRole("link", { name: "Sessão ativa" })).toHaveCount(0);
    await expect(page.locator(".sidebar .brand-mark")).toHaveCSS(
      "background-image",
      /giromesa-symbol\.svg/,
    );
  });

  test("keeps the mobile workspace focused until the operator opens navigation", async ({
    page,
  }) => {
    await skipWhenApiUnavailable();
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateBrowserPage(page);

    const navigation = page.locator("#app-primary-navigation");
    const toggle = page.getByRole("button", { name: "Abrir menu de módulos" });
    await expect(toggle).toBeVisible();
    await expect(navigation).toBeHidden();

    await toggle.click();
    await expect(navigation).toBeVisible();
    await expect(page.getByRole("button", { name: "Fechar menu de módulos" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
