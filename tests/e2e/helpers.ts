import type { APIRequestContext, Page } from "@playwright/test";
import { expect, request as playwrightRequest, test } from "@playwright/test";

export const apiUrl = process.env.API_URL ?? "http://localhost:3333";
export const adminEmail = "admin@bar-aurora-demo.local";
export const adminPassword = process.env.E2E_TEST_PASSWORD ?? process.env.SEED_TEST_PASSWORD ?? "";
export const platformEmail = "owner@giromesa.local";
export const platformPassword =
  process.env.E2E_PLATFORM_PASSWORD ?? process.env.SEED_PLATFORM_PASSWORD ?? "";

function requireCredential(value: string, envName: string) {
  if (!value) {
    throw new Error(`${envName} must be provided for authenticated E2E tests`);
  }
  return value;
}

export async function skipWhenApiUnavailable() {
  const health = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const response = await health.get("/health", { timeout: 2_500 });
    test.skip(!response.ok(), "API local indisponivel; rode Docker, migrations, seed e API dev.");
  } catch {
    test.skip(true, "API local indisponivel; rode Docker, migrations, seed e API dev.");
  } finally {
    await health.dispose();
  }
}

export async function authenticateBrowserPage(
  page: Page,
  email = adminEmail,
  password = adminPassword,
) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await loginViaUi(page, email, password);
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
}

export async function authenticatePlatformPage(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await loginViaUi(page, platformEmail, platformPassword);
  await expect(page).toHaveURL(/\/platform/, { timeout: 30_000 });
}

export async function authenticatedApiContext(email = adminEmail, password = adminPassword) {
  requireCredential(password, "E2E_TEST_PASSWORD/SEED_TEST_PASSWORD");
  const loginApi = await playwrightRequest.newContext({ baseURL: apiUrl });
  const login = await loginApi.post("/api/v1/auth/login", { data: { email, password } });
  expect(login.ok()).toBe(true);
  const cookie = login.headers()["set-cookie"];
  if (!cookie) {
    // MFA may be enabled; the response body has no cookie
    test.skip(true, "No set-cookie in response; MFA may be enabled on this user.");
  }
  expect(cookie).toContain("gm_session=");
  await loginApi.dispose();
  return { cookie, api: await apiContextFromCookie(cookie) };
}

export async function apiContextFromCookie(cookie: string): Promise<APIRequestContext> {
  const csrfApi = await playwrightRequest.newContext({ baseURL: apiUrl });
  const csrfResponse = await csrfApi.get("/api/v1/auth/csrf", {
    headers: { cookie },
  });
  expect(csrfResponse.ok()).toBe(true);
  const csrfToken = ((await csrfResponse.json()) as { csrfToken: string }).csrfToken;
  await csrfApi.dispose();

  return playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { cookie, "x-csrf-token": csrfToken },
  });
}

export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
  options: { acceptLegal?: boolean } = {},
) {
  requireCredential(password, "E2E_TEST_PASSWORD/SEED_TEST_PASSWORD");
  await chooseCookieConsent(page, "reject");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await expect(page.getByTestId("login-submit")).toBeEnabled();

  // Listen for ALL responses to catch the login even if status is unexpected
  const loginResponsePromise = page
    .waitForResponse((response) => response.url().includes("/api/v1/auth/login"), {
      timeout: 15_000,
    })
    .catch(() => null);

  await page.getByTestId("login-submit").click();

  const loginResponse = await loginResponsePromise;
  if (loginResponse) {
    console.log(
      `[loginViaUi] Login response: ${loginResponse.status()} from ${loginResponse.url()}`,
    );
  } else {
    console.log("[loginViaUi] No login response received within 15s");
  }

  if (!loginResponse?.ok()) return;

  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 10_000 });
  const isPlatformSession = new URL(page.url()).pathname.startsWith("/platform");
  if (!isPlatformSession && options.acceptLegal !== false) {
    const accepted = await acceptCurrentLegalDocuments(page);
    if (accepted) await page.reload();
  }
}

export async function acceptCurrentLegalDocuments(page: Page) {
  const statusResponse = await page.request.get(`${apiUrl}/api/v1/auth/legal-acceptances/status`);
  expect(statusResponse.ok()).toBe(true);
  const status = (await statusResponse.json()) as {
    required: boolean;
    complete: boolean;
    configurationComplete: boolean;
    documents: Array<{
      documentType: "terms" | "privacy";
      published: boolean;
      accepted: boolean;
    }>;
  };

  if (!status.required || status.complete) return false;
  expect(status.configurationComplete).toBe(true);

  const missing = status.documents.filter((document) => document.published && !document.accepted);
  const csrfResponse = await page.request.get(`${apiUrl}/api/v1/auth/csrf`);
  expect(csrfResponse.ok()).toBe(true);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  for (const document of missing) {
    const response = await page.request.post(`${apiUrl}/api/v1/auth/legal-acceptances`, {
      headers: { "x-csrf-token": csrfToken },
      data: {
        documentType: document.documentType,
        accepted: true,
        origin: "e2e_login_helper",
      },
    });
    expect(response.ok()).toBe(true);
  }

  return missing.length > 0;
}

export async function chooseCookieConsent(page: Page, choice: "accept" | "reject" = "reject") {
  const banner = page.getByRole("region", { name: /Preferências de cookies/i });
  const visible = await banner
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;

  await banner
    .getByRole("button", {
      name: choice === "accept" ? "Aceitar opcionais" : "Recusar opcionais",
    })
    .click();
  await expect(banner).toBeHidden();
}
