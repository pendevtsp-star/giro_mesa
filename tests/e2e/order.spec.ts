import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from "@playwright/test";
import { apiUrl, authenticatedApiContext, skipWhenApiUnavailable } from "./helpers";

async function createOrderTestTable(api: APIRequestContext, branchId: string, suffix: string) {
  const code = `O${suffix}${String(Date.now()).slice(-5)}`.slice(0, 40);
  const response = await api.post("/api/v1/pos/tables", {
    data: { branchId, code, name: `Mesa ${code}`, seats: 4 },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: string; code: string };
}

test.describe("Order: create, add items, send to kitchen, pay and close", () => {
  test("creates an order on a table and adds items via API", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    expect(me.ok()).toBe(true);
    const context = (await me.json()).context as { branchId: string };
    expect(context.branchId).toBeTruthy();

    const products = await api.get("/api/v1/catalog/products");
    expect(products.ok()).toBe(true);
    const productList = (await products.json()).data as { id: string; name: string }[];
    expect(productList.length).toBeGreaterThan(0);
    const product = productList[0];

    const table = await createOrderTestTable(api, context.branchId, "A");

    const opened = await api.post("/api/v1/pos/orders/open", {
      data: { channel: "table", branchId: context.branchId, tableId: table.id, peopleCount: 2 },
    });
    expect(opened.ok()).toBe(true);
    const order = await opened.json();
    expect(order.id).toBeTruthy();
    expect(order.status).toMatch(/draft|opened/);

    const item = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: { productId: product.id, quantity: 2, notes: "E2E order test" },
    });
    expect(item.ok()).toBe(true);
    const orderItem = await item.json();
    expect(orderItem.nameSnapshot).toBeTruthy();
    expect(Number(orderItem.quantity)).toBe(2);
    expect(orderItem.totalCents).toBeGreaterThan(0);

    const secondItem = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: { productId: product.id, quantity: 1 },
    });
    expect(secondItem.ok()).toBe(true);

    await api.dispose();
  });

  test("sends order to kitchen and creates KDS tickets", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const context = (await me.json()).context as { branchId: string };

    const products = await api.get("/api/v1/catalog/products");
    const productList = (await products.json()).data as { id: string }[];
    const table = await createOrderTestTable(api, context.branchId, "B");

    const opened = await api.post("/api/v1/pos/orders/open", {
      data: { channel: "table", branchId: context.branchId, tableId: table.id, peopleCount: 1 },
    });
    const order = await opened.json();

    await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: { productId: productList[0].id, quantity: 1 },
    });

    const sent = await api.post(`/api/v1/pos/orders/${order.id}/send-to-kitchen`);
    expect(sent.ok()).toBe(true);
    const sentPayload = await sent.json();
    expect(sentPayload.ticketsCreated.length).toBeGreaterThan(0);
    expect(sentPayload.status).toBe("sent_to_kitchen");

    await api.dispose();
  });

  test("processes payment and closes order", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const context = (await me.json()).context as { branchId: string };

    const products = await api.get("/api/v1/catalog/products");
    const productList = (await products.json()).data as { id: string }[];
    const table = await createOrderTestTable(api, context.branchId, "C");

    const opened = await api.post("/api/v1/pos/orders/open", {
      data: { channel: "table", branchId: context.branchId, tableId: table.id, peopleCount: 1 },
    });
    const order = await opened.json();

    const item = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: { productId: productList[0].id, quantity: 1 },
    });
    const orderItem = await item.json();

    const payment = await api.post(`/api/v1/pos/orders/${order.id}/payments`, {
      data: {
        amountCents: orderItem.totalCents,
        method: "pix_manual",
        idempotencyKey: `e2e-payment-${Date.now()}`,
      },
    });
    expect(payment.ok()).toBe(true);
    const paymentPayload = await payment.json();
    expect(paymentPayload.orderStatus).toBe("paid");

    const closed = await api.post(`/api/v1/pos/orders/${order.id}/close`);
    expect(closed.ok()).toBe(true);
    expect((await closed.json()).audit).toBe("order.closed");

    await api.dispose();
  });

  test("handles QR order flow: submit from public API, review and send to kitchen", async () => {
    await skipWhenApiUnavailable();

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
    expect(qrProducts.length).toBeGreaterThanOrEqual(1);

    const qrOrder = await publicApi.post("/api/v1/catalog/public/qr/M03/orders", {
      data: {
        tenantSlug: "bar-aurora-demo",
        items: qrProducts.map((p) => ({ productId: p.id, quantity: 1, notes: "E2E QR" })),
      },
    });
    expect(qrOrder.ok()).toBe(true);
    const qrOrderPayload = (await qrOrder.json()) as { orderId: string };
    await publicApi.dispose();

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const context = (await me.json()).context as { branchId: string };

    const pending = await api.get(`/api/v1/pos/orders/qr-pending?branchId=${context.branchId}`);
    expect(pending.ok()).toBe(true);
    const order = (
      (await pending.json()) as {
        data: { id: string; items: { id: string }[] }[];
      }
    ).data.find((row) => row.id === qrOrderPayload.orderId);
    expect(order).toBeTruthy();
    expect(order?.items.length).toBeGreaterThanOrEqual(1);

    const sent = await api.post(`/api/v1/pos/orders/${qrOrderPayload.orderId}/send-to-kitchen`);
    expect(sent.ok()).toBe(true);

    await api.dispose();
  });
});
