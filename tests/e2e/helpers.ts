import type { APIRequestContext, Page } from "@playwright/test";
import { expect, request as playwrightRequest, test } from "@playwright/test";

export const apiUrl = process.env.API_URL ?? "http://localhost:3333";
export const adminEmail = "admin@bar-aurora-demo.local";
export const adminPassword = "Demo@12345";
export const platformEmail = "owner@giromesa.local";
export const platformPassword = "Platform@12345";

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
  await expect(page).toHaveURL(/\/app/);
}

export async function authenticatePlatformPage(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await loginViaUi(page, platformEmail, platformPassword);
  await expect(page).toHaveURL(/\/platform/);
}

export async function authenticatedApiContext(email = adminEmail, password = adminPassword) {
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

export async function loginViaUi(page: Page, email: string, password: string) {
  await expect(page.getByTestId("login-submit")).toBeEnabled();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

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
}
