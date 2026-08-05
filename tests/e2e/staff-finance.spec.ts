import { expect, test } from "@playwright/test";
import { adminPassword, authenticateBrowserPage, skipWhenApiUnavailable } from "./helpers";

const shiftId = "10000000-0000-4000-8000-000000000001";
const settlementId = "10000000-0000-4000-8000-000000000003";
const orderId = "10000000-0000-4000-8000-000000000004";

test.describe("Fechamento da equipe", () => {
  test.use({ bypassCSP: true });
  test.beforeEach(async () => {
    await skipWhenApiUnavailable();
  });

  test("gerente configura a regra, ajusta a taxa e consulta detalhe auditável", async ({
    page,
  }) => {
    await authenticateBrowserPage(page, "gerente@bar-aurora-demo.local", adminPassword);
    await mockManagerData(page);
    await page.goto("/app/team/settlements", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Fechamento da equipe" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Como dividir vendas e serviço" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Taxa de serviço por comanda" })).toBeVisible();
    await expect(page.getByText("Aguardando confirmação do garçom")).toBeVisible();
    await expect(page.getByRole("button", { name: "Conferir", exact: true })).toHaveCount(0);

    const policyRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/staff-finance/service-policy") && request.method() === "PUT",
    );
    await page.getByRole("button", { name: "Salvar regra" }).click();
    expect((await policyRequest).postDataJSON()).toMatchObject({
      branchId: expect.any(String),
      expectedVersion: 3,
      idempotencyKey: expect.any(String),
    });

    const chargeRequest = page.waitForRequest((request) =>
      request.url().includes(`/orders/${orderId}/service-charge`),
    );
    await page.getByRole("button", { name: "Aceitar" }).click();
    expect((await chargeRequest).postDataJSON()).toMatchObject({
      action: "accept",
      expectedVersion: 7,
    });

    await page.getByRole("button", { name: "Detalhar" }).click();
    await expect(page.getByRole("heading", { name: "Detalhamento do fechamento" })).toBeVisible();
    await expect(page.getByText(/Hash aaaaaaaaaaaa/)).toBeVisible();
  });

  test("garçom confirma apenas o próprio fechamento e enxerga os centavos", async ({ page }) => {
    await authenticateBrowserPage(page, "garcom@bar-aurora-demo.local", adminPassword);
    await page.route("**/api/v1/pos/shift/current?**", (route) =>
      route.fulfill({ json: { shift: { id: shiftId } } }),
    );
    await page.route("**/api/v1/staff-finance/me/settlements?**", (route) =>
      route.fulfill({ json: { data: [settlement()] } }),
    );
    await page.route(`**/api/v1/staff-finance/settlements/${settlementId}/confirm`, (route) =>
      route.fulfill({ json: { ...settlement(), status: "checked", version: 2 } }),
    );
    await page.goto("/app/waiter/settlement", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Meu fechamento" })).toBeVisible();
    await page.getByText("Ver conferência centavo a centavo").click();
    await expect(page.getByText(/Comanda 10000000/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar valores" }).click();
    await expect(page.getByText("Fechamento confirmado com auditoria.")).toBeVisible();
  });

  test("caixa recebe atalho direto para conferir a equipe antes do fechamento", async ({
    page,
  }) => {
    await authenticateBrowserPage(page, "caixa@bar-aurora-demo.local", adminPassword);
    await page.route("**/api/v1/pos/shift/current?**", (route) =>
      route.fulfill({ json: { shift: { id: shiftId, openedAt: new Date().toISOString() } } }),
    );
    await page.goto("/app/cash", { waitUntil: "networkidle" });
    const shortcut = page.getByRole("link", { name: "Conferir equipe" });
    await expect(shortcut).toBeVisible();
    await expect(shortcut).toHaveAttribute("href", new RegExp(shiftId));
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 900 },
    { label: "desktop compacto", width: 1024, height: 768 },
    { label: "tablet", width: 768, height: 1024 },
    { label: "celular", width: 390, height: 844 },
  ]) {
    for (const theme of ["light", "dark"] as const) {
      test(`permanece legível em ${theme} no ${viewport.label}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript(
          (selectedTheme) => localStorage.setItem("giromesa_theme", selectedTheme),
          theme,
        );
        await authenticateBrowserPage(page, "gerente@bar-aurora-demo.local", adminPassword);
        await mockManagerData(page);
        await page.goto("/app/team/settlements", { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { name: "Fechamento da equipe" })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        const colors = await page.locator(".staff-finance-notice").evaluate((element) => {
          const style = getComputedStyle(element);
          return { color: style.color, background: style.backgroundColor };
        });
        expect(colors.color).not.toBe(colors.background);
      });
    }
  }
});

async function mockManagerData(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/printing/devices?**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/pos/shift/current?**", (route) =>
    route.fulfill({ json: { shift: { id: shiftId } } }),
  );
  await page.route(`**/api/v1/staff-finance/shifts/${shiftId}/settlements`, (route) =>
    route.fulfill({
      json: {
        data: [settlement()],
        managerial: null,
      },
    }),
  );
  await page.route("**/api/v1/staff-finance/occurrences?**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/staff-finance/open-orders?**", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: orderId,
            tableId: null,
            channel: "counter",
            status: "served",
            subtotalCents: 10_000,
            discountCents: 0,
            serviceChargeSuggestedCents: 1_000,
            serviceChargeCents: 0,
            serviceChargeStatus: "suggested",
            totalCents: 10_000,
            version: 7,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/staff-finance/commission-policies?**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/staff-finance/commission-accruals?**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/staff-finance/commission-payment-records?**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/staff-finance/service-policy?**", (route) => {
    if (route.request().method() === "PUT")
      return route.fulfill({ json: { id: "policy", version: 4 } });
    return route.fulfill({
      json: {
        id: "policy",
        attributionMode: "table_responsible",
        serviceRateBps: 1_000,
        serviceBase: "net_consumption",
        requireWaiterConfirmation: true,
        poolRules: {},
        version: 3,
      },
    });
  });
  await page.route("**/api/v1/staff-finance/reports/financial?**", (route) =>
    route.fulfill({
      json: {
        projectionHash: "b".repeat(64),
        totals: {
          grossSalesCents: 10_000,
          cancelledCents: 0,
          discountCents: 0,
          netConsumptionCents: 10_000,
          serviceSuggestedCents: 1_000,
          serviceReceivedCents: 1_000,
          pendingCashCents: 0,
          unassignedNetCents: 0,
          openLossCents: 0,
          recoveredCents: 0,
          approvedCommissionCents: 0,
          informedCommissionPaidCents: 0,
        },
        totalEntries: [
          { key: "netConsumptionCents", label: "Consumo líquido", valueCents: 10_000 },
          {
            key: "informedCommissionPaidCents",
            label: "Partnership informado como pago",
            valueCents: 0,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/staff-finance/settlements/${settlementId}`, (route) =>
    route.fulfill({ json: settlement() }),
  );
  await page.route(`**/api/v1/staff-finance/orders/${orderId}/service-charge`, (route) =>
    route.fulfill({ json: { id: orderId, version: 8 } }),
  );
}

function settlement() {
  return {
    id: settlementId,
    waiterUserId: "10000000-0000-4000-8000-000000000005",
    status: "awaiting_confirmation",
    netConsumptionCents: 10_000,
    serviceReceivedCents: 1_000,
    pendingCashCents: 0,
    calculatedAt: "2026-08-05T00:00:00.000Z",
    ledgerHash: "a".repeat(64),
    policySnapshot: { requireWaiterConfirmation: true },
    breakdown: {
      orders: [
        {
          orderId,
          itemIds: ["item"],
          netPaidCents: 10_000,
          serviceReceivedCents: 1_000,
          discountCents: 0,
          recipients: [
            {
              recipientId: "10000000-0000-4000-8000-000000000005",
              netPaidCents: 10_000,
              serviceReceivedCents: 1_000,
              discountCents: 0,
            },
          ],
        },
      ],
    },
    version: 1,
  };
}
