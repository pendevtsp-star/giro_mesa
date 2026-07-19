import { expect, request as playwrightRequest, test } from "@playwright/test";

const apiUrl = process.env.API_URL ?? "http://localhost:3333";

test.describe("GiroMesa public trial", () => {
  test("creates a seven-day trial without card and opens an authenticated session", async ({
    page,
  }) => {
    await skipWhenApiUnavailable();
    const suffix = Date.now();

    await page.goto("/teste-gratis", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Teste grátis GiroMesa" })).toBeVisible();
    await expect(page.getByText("Sem cartão na criação da conta")).toBeVisible();

    await page.getByPlaceholder("Ex.: Bar Aurora").fill(`Trial E2E ${suffix}`);
    await page.getByPlaceholder("Nome do responsável").fill("Cliente E2E");
    await page.getByPlaceholder("voce@restaurante.com.br").fill(`trial-e2e-${suffix}@giromesa.com`);
    await page.getByPlaceholder("WhatsApp para contato").fill("11999999999");
    await page.getByPlaceholder("Mínimo 8 caracteres com símbolo").fill("Teste@12345");
    await expect(page.getByTestId("trial-submit")).toBeEnabled();
    const trialResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/v1/auth/trial") && response.status() === 201,
    );
    await page.getByTestId("trial-submit").click();
    await trialResponsePromise;

    await expect(page).toHaveURL(/\/app\/onboarding/);

    const api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      storageState: await page.context().storageState(),
    });
    const me = await api.get("/api/v1/auth/me");
    expect(me.ok()).toBe(true);
    const payload = (await me.json()) as {
      context: {
        billing?: {
          status: string;
          trialDaysRemaining: number | null;
          tenantStatus: string | null;
        };
      };
    };
    expect(payload.context.billing?.status).toBe("trial_ok");
    expect(payload.context.billing?.tenantStatus).toBe("trial");
    expect(payload.context.billing?.trialDaysRemaining).toBe(7);
    await api.dispose();
  });
});

async function skipWhenApiUnavailable() {
  const health = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const response = await health.get("/health", { timeout: 2_500 });
    test.skip(!response.ok(), "API local indisponível; rode Docker, migrations e API dev.");
  } catch {
    test.skip(true, "API local indisponível; rode Docker, migrations e API dev.");
  } finally {
    await health.dispose();
  }
}
