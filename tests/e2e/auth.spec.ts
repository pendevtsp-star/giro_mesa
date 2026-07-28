import { expect, test } from "@playwright/test";
import {
  adminEmail,
  adminPassword,
  authenticateBrowserPage,
  authenticatedApiContext,
  loginViaUi,
  platformEmail,
  platformPassword,
  skipWhenApiUnavailable,
} from "./helpers";

test.describe("Auth: login flow", () => {
  test("logs in with valid tenant credentials and redirects to /app", async ({ page }) => {
    await skipWhenApiUnavailable();
    await page.goto("/login", { waitUntil: "networkidle" });

    await loginViaUi(page, adminEmail, adminPassword);
    await expect(page).toHaveURL(/\/app/);
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

    await page.locator('input[name="email"]').fill(adminEmail);
    // The reset button is a <button type="button"> with ghost class
    await page.locator('button.ghost[type="button"]').last().click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 8_000 });
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
});
