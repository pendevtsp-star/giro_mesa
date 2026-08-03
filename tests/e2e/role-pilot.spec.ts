import { expect, test } from "@playwright/test";
import {
  adminPassword,
  authenticateBrowserPage,
  loginViaUi,
  skipWhenApiUnavailable,
} from "./helpers";

const roles = {
  owner: {
    email: "admin@bar-aurora-demo.local",
    password: adminPassword,
  },
  manager: {
    email: "gerente@bar-aurora-demo.local",
    password: adminPassword,
  },
  cashier: {
    email: "caixa@bar-aurora-demo.local",
    password: adminPassword,
  },
  waiter: {
    email: "garcom@bar-aurora-demo.local",
    password: adminPassword,
  },
  kitchen: {
    email: "cozinha@bar-aurora-demo.local",
    password: adminPassword,
  },
} as const;

test.describe("Piloto guiado por perfil", () => {
  test.beforeEach(async () => {
    await skipWhenApiUnavailable();
  });

  test("proprietário acessa gestão, QR e equipe", async ({ page }) => {
    await authenticateBrowserPage(page, roles.owner.email, roles.owner.password);

    await expect(page.locator(".user-avatar-role")).toHaveText("Dono ou administrador");
    await expect(navLink(page, "/app/qr")).toBeVisible();
    await expect(navLink(page, "/app/team")).toBeVisible();

    await page.goto("/app/qr", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "QR personalizado por mesa" })).toBeVisible();
    await page.goto("/app/team", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Usuários, convites e cargos" })).toBeVisible();
  });

  test("gerente recebe somente atalhos autorizados e dashboard sem 403", async ({ page }) => {
    const forbiddenResponses: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 403) forbiddenResponses.push(response.url());
    });

    await authenticateBrowserPage(page, roles.manager.email, roles.manager.password);
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".user-avatar-role")).toHaveText("Gerente");
    await expect(navLink(page, "/app/salon")).toBeVisible();
    await expect(navLink(page, "/app/reports")).toBeVisible();
    await expect(navLink(page, "/app/settings/operation")).toBeVisible();
    await expect(navLink(page, "/app/team")).toHaveCount(0);
    expect(forbiddenResponses).toEqual([]);
  });

  test("caixa opera caixa e relatórios sem receber catálogo ou KDS", async ({ page }) => {
    await authenticateBrowserPage(page, roles.cashier.email, roles.cashier.password);

    await expect(page.locator(".user-avatar-role")).toHaveText("Caixa");
    await expect(navLink(page, "/app/cash")).toBeVisible();
    await expect(navLink(page, "/app/reports")).toBeVisible();
    await expect(navLink(page, "/app/catalog")).toHaveCount(0);
    await expect(navLink(page, "/app/kds")).toHaveCount(0);

    await page.goto("/app/cash", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Turno e caixa" })).toBeVisible();
  });

  test("garçom opera salão e atendimento, com bloqueio legível para caixa", async ({ page }) => {
    await authenticateBrowserPage(page, roles.waiter.email, roles.waiter.password);

    await expect(page.locator(".user-avatar-role")).toHaveText("Garçom");
    await expect(navLink(page, "/app/waiter")).toBeVisible();
    await expect(navLink(page, "/app/salon")).toBeVisible();
    await expect(navLink(page, "/app/cash")).toHaveCount(0);
    await expect(navLink(page, "/app/catalog")).toHaveCount(0);
    await expect(navLink(page, "/app/kds")).toHaveCount(0);

    await page.goto("/app/waiter", { waitUntil: "networkidle" });
    await expect(page.locator(".stepper-step-title").first()).toBeVisible();

    const forbiddenResponses: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 403) forbiddenResponses.push(response.url());
    });
    await page.goto("/app/cash", { waitUntil: "networkidle" });
    await expect(page.getByTestId("permission-denied")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Esta área não faz parte do seu acesso" }),
    ).toBeVisible();
    expect(forbiddenResponses).toEqual([]);
  });

  test("cozinha vê somente produção e não recebe atalho de PDV", async ({ page }) => {
    await authenticateBrowserPage(page, roles.kitchen.email, roles.kitchen.password);

    await expect(page.locator(".user-avatar-role")).toHaveText("Cozinha ou bar");
    await expect(navLink(page, "/app/kds")).toBeVisible();
    await expect(navLink(page, "/app/pos")).toHaveCount(0);
    await expect(page.getByTestId("open-pos")).toHaveCount(0);

    await page.goto("/app/kds", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "KDS" })).toBeVisible();
    await expect(page.getByText(/R atualizar · S som · F tela cheia/)).toBeVisible();
    await page.goto("/app/pos", { waitUntil: "networkidle" });
    await expect(page.getByTestId("permission-denied")).toBeVisible();
    await expect(page.getByText("forbidden", { exact: true })).toHaveCount(0);
  });

  test("cliente QR consulta cardápio e chama o garçom", async ({ page }) => {
    await page.goto("/q/M03", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Bar Aurora" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Chamar garçom/i })).toBeEnabled();
    await page.getByRole("button", { name: /Chamar garçom/i }).click();
    await expect(page.locator(".qr-note")).toContainText("Garçom chamado");
  });

  test("indisponibilidade do service worker não quebra o carregamento", async ({ browser }) => {
    const baseURL = process.env.WEB_URL ?? "http://localhost:3004";
    const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
    const page = await context.newPage();
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });

    await page.goto("/login", { waitUntil: "networkidle" });
    await loginViaUi(page, roles.owner.email, roles.owner.password);
    await expect(page.getByTestId("workspace-dashboard")).toBeVisible();
    expect(runtimeErrors.filter((message) => message.includes("addEventListener"))).toEqual([]);
    await context.close();
  });
});

function navLink(page: import("@playwright/test").Page, href: string) {
  return page.locator(`.sidebar nav a[href="${href}"]`);
}
