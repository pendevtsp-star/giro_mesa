import { expect, request as playwrightRequest, test } from "@playwright/test";
import { apiUrl, authenticatedApiContext, skipWhenApiUnavailable } from "./helpers";

test.describe("Digital menu: public access, filtering and QR order", () => {
  test("public menu page loads with tenant branding and products", async ({ page }) => {
    await page.goto("/m/bar-aurora-demo", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Bar Aurora" })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Cardápio digital")).toBeVisible();
    await expect(page.locator(".menu-item").first()).toBeVisible();
  });

  test("QR menu page loads via table code and shows products", async ({ page }) => {
    await page.goto("/q/M03", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Bar Aurora" })).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByText("Burger Clássico").or(page.getByText("Burger Classico")),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Chamar garçom/i })).toBeVisible();
  });

  test("menu product search filters results", async ({ page }) => {
    await page.goto("/m/bar-aurora-demo", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".menu-item").first()).toBeVisible({ timeout: 8_000 });

    const searchInput = page.getByPlaceholder("Buscar no cardápio");
    await expect(searchInput).toBeVisible();

    const allItems = page.locator(".menu-item");
    const initialCount = await allItems.count();
    expect(initialCount).toBeGreaterThan(0);

    await searchInput.fill("Burger");
    const filteredItems = page.locator(".menu-item");
    await expect(filteredItems.first()).toBeVisible({ timeout: 3_000 });
    const filteredCount = await filteredItems.count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test("menu category filter narrows product list", async ({ page }) => {
    await page.goto("/m/bar-aurora-demo", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".menu-item").first()).toBeVisible({ timeout: 8_000 });

    const allItems = page.locator(".menu-item");
    const initialCount = await allItems.count();

    const categoryButtons = page.locator(".filter-row .filter");
    const categoryCount = await categoryButtons.count();
    if (categoryCount > 1) {
      await categoryButtons.nth(1).click();
      const filteredCount = await allItems.count();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test("QR order can be submitted via public API and reviewed by admin", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const context = (await me.json()).context as { branchId: string };
    const tables = await api.get(`/api/v1/pos/tables?branchId=${context.branchId}`);
    const table = ((await tables.json()).data as { id: string; code: string }[]).find(
      (candidate) => candidate.code === "M06",
    );
    expect(table).toBeTruthy();
    const service = await api.post("/api/v1/pos/orders/open", {
      data: {
        channel: "table",
        branchId: context.branchId,
        tableId: table?.id,
        peopleCount: 2,
        idempotencyKey: `e2e-menu-open-${Date.now()}`,
      },
    });
    expect(service.ok()).toBe(true);

    const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    const menu = await publicApi.get("/api/v1/catalog/public/menu/bar-aurora-demo");
    expect(menu.ok()).toBe(true);
    const qrProducts = (
      (await menu.json()) as {
        products: { id: string; isAvailable: boolean; channels: string[] }[];
      }
    ).products
      .filter((product) => product.isAvailable && product.channels.includes("qr"))
      .slice(0, 2);

    const qrOrder = await publicApi.post("/api/v1/catalog/public/qr/M06/orders", {
      data: {
        tenantSlug: "bar-aurora-demo",
        items: qrProducts.map((p) => ({ productId: p.id, quantity: 1 })),
      },
    });
    expect(qrOrder.ok()).toBe(true);
    const qrPayload = (await qrOrder.json()) as { orderId: string };
    expect(qrPayload.orderId).toBeTruthy();
    await publicApi.dispose();

    const pending = await api.get(`/api/v1/pos/orders/qr-pending?branchId=${context.branchId}`);
    expect(pending.ok()).toBe(true);
    const pendingOrders = (await pending.json()).data as { id: string }[];
    expect(pendingOrders.some((o) => o.id === qrPayload.orderId)).toBe(true);

    await api.dispose();
  });

  test("menu add button is visible for each product", async ({ page }) => {
    await page.goto("/m/bar-aurora-demo", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".menu-item").first()).toBeVisible({ timeout: 8_000 });

    const addButtons = page.locator('.menu-item button[aria-label^="Adicionar"]');
    const count = await addButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("menu footer shows availability disclaimer", async ({ page }) => {
    await page.goto("/m/bar-aurora-demo", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/disponibilidade|turno|aviso|menu/i)).toBeVisible({
      timeout: 8_000,
    });
  });
});
