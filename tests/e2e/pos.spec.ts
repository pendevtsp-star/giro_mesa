import { expect, test } from "@playwright/test";
import {
  authenticateBrowserPage,
  authenticatedApiContext,
  skipWhenApiUnavailable,
} from "./helpers";

test.describe("POS: open PDV, add products, process payment", () => {
  test("opens PDV page and shows product grid", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await page.goto("/app/pos", { waitUntil: "networkidle" });
    await expect(page.locator(".pos-product-grid")).toBeVisible({ timeout: 8_000 });
  });

  test("shows product grid with items from catalog", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await page.goto("/app/pos", { waitUntil: "networkidle" });
    await expect(page.locator(".pos-product-grid")).toBeVisible({ timeout: 8_000 });

    const productCards = page.locator(".pos-product-card");
    const count = await productCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("adds a product to the order ticket via browser", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await page.goto("/app/pos", { waitUntil: "networkidle" });
    await expect(page.locator(".pos-product-grid")).toBeVisible({ timeout: 8_000 });

    const firstProduct = page.locator(".pos-product-card").first();
    await expect(firstProduct).toBeVisible();

    const addResponsePromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/v1/pos/orders/") &&
          response.url().includes("/items") &&
          response.ok(),
        { timeout: 10_000 },
      )
      .catch(() => null);

    await firstProduct.click();
    const addResponse = await addResponsePromise;
    expect(addResponse).not.toBeNull();
  });

  test("clicking a product triggers an API call", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await page.goto("/app/pos", { waitUntil: "networkidle" });
    await expect(page.locator(".pos-product-grid")).toBeVisible({ timeout: 8_000 });

    const firstProduct = page.locator(".pos-product-card").first();
    await expect(firstProduct).toBeVisible();

    // Click product - should either add to order or show table selector
    const responsePromise = page
      .waitForResponse((response) => response.url().includes("/api/v1/pos/orders"), {
        timeout: 10_000,
      })
      .catch(() => null);

    await firstProduct.click();
    const response = await responsePromise;
    // Either an order was created/updated, or a dialog appeared - both are valid
    expect(
      response !== null ||
        (await page
          .getByRole("dialog")
          .isVisible()
          .catch(() => false)),
    ).toBe(true);
  });

  test("POS handles full lifecycle: add item, send to kitchen, pay, close via API", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const context = (await me.json()).context as { branchId: string };

    const products = await api.get("/api/v1/catalog/products");
    const productList = (await products.json()).data as { id: string }[];
    const tables = await api.get(`/api/v1/pos/tables?branchId=${context.branchId}`);
    const tableList = (await tables.json()).data as { id: string }[];
    const freeTable = tableList.find((t) => t.code === "M02") ?? tableList[0];

    const opened = await api.post("/api/v1/pos/orders/open", {
      data: {
        channel: "table",
        branchId: context.branchId,
        tableId: freeTable.id,
        peopleCount: 3,
        idempotencyKey: `e2e-pos-open-${Date.now()}`,
      },
    });
    expect(opened.ok()).toBe(true);
    const order = await opened.json();

    const item = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: {
        productId: productList[0].id,
        quantity: 2,
        notes: "POS E2E",
        idempotencyKey: `e2e-pos-item-${Date.now()}`,
      },
    });
    expect(item.ok()).toBe(true);
    const orderItem = await item.json();

    const sent = await api.post(`/api/v1/pos/orders/${order.id}/send-to-kitchen`);
    expect(sent.ok()).toBe(true);
    expect((await sent.json()).ticketsCreated.length).toBeGreaterThan(0);

    const payment = await api.post(`/api/v1/pos/orders/${order.id}/payments`, {
      data: {
        amountCents: orderItem.totalCents,
        method: "cash",
        idempotencyKey: `e2e-pos-${Date.now()}`,
      },
    });
    expect(payment.ok()).toBe(true);
    expect((await payment.json()).orderStatus).toBe("paid");

    const closed = await api.post(`/api/v1/pos/orders/${order.id}/close`);
    expect(closed.ok()).toBe(true);
    expect((await closed.json()).audit).toBe("order.closed");

    await api.dispose();
  });

  test("print receipt endpoint responds after payment", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const context = (await me.json()).context as { branchId: string };

    const products = await api.get("/api/v1/catalog/products");
    const productList = (await products.json()).data as { id: string }[];
    const tables = await api.get(`/api/v1/pos/tables?branchId=${context.branchId}`);
    const tableList = (await tables.json()).data as { id: string }[];
    const table = tableList.find((t) => t.code === "M04") ?? tableList[0];

    const opened = await api.post("/api/v1/pos/orders/open", {
      data: {
        channel: "table",
        branchId: context.branchId,
        tableId: table.id,
        peopleCount: 1,
        idempotencyKey: `e2e-receipt-open-${Date.now()}`,
      },
    });
    const order = await opened.json();

    const item = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: {
        productId: productList[0].id,
        quantity: 1,
        idempotencyKey: `e2e-receipt-item-${Date.now()}`,
      },
    });
    const orderItem = await item.json();

    const payment = await api.post(`/api/v1/pos/orders/${order.id}/payments`, {
      data: {
        amountCents: orderItem.totalCents,
        method: "pix_manual",
        idempotencyKey: `e2e-receipt-${Date.now()}`,
      },
    });
    expect(payment.ok()).toBe(true);

    const receipt = await api.post(`/api/v1/pos/orders/${order.id}/print-payment-receipt`);
    // Print may return 200 or 201 (mock printer) - just check it doesn't error
    expect(receipt.status()).toBeLessThan(500);

    await api.dispose();
  });
});
