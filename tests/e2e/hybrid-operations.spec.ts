import { expect, test } from "@playwright/test";
import { authenticatedApiContext, skipWhenApiUnavailable } from "./helpers";

test.describe("Hybrid operation", () => {
  test("runs policy, approval, floor and cash handover flows with tenant scope", async () => {
    await skipWhenApiUnavailable();
    const { api } = await authenticatedApiContext();

    const me = await api.get("/api/v1/auth/me");
    expect(me.ok()).toBe(true);
    const context = (await me.json()).context as { branchId: string };

    const policy = await api.get("/api/v1/operation/policies");
    expect(policy.ok()).toBe(true);
    expect((await policy.json()).maxDiscountWithoutApprovalBps).toBe(1000);

    const reservation = await api.post("/api/v1/floor/reservations", {
      data: {
        customerName: `Reserva E2E ${Date.now()}`,
        partySize: 2,
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    expect(reservation.ok()).toBe(true);

    const waitlist = await api.post("/api/v1/floor/waitlist", {
      data: {
        customerName: `Fila E2E ${Date.now()}`,
        partySize: 3,
        quotedWaitMinutes: 15,
      },
    });
    expect(waitlist.ok()).toBe(true);

    const tableCode = `E${String(Date.now()).slice(-5)}`;
    const tableResponse = await api.post("/api/v1/pos/tables", {
      data: {
        branchId: context.branchId,
        code: tableCode,
        name: `Mesa ${tableCode}`,
        seats: 4,
      },
    });
    expect(tableResponse.ok()).toBe(true);
    const table = (await tableResponse.json()) as { id: string };

    const seated = await api.post(
      `/api/v1/floor/reservations/${(await reservation.json()).id}/seat`,
      { data: { tableId: table.id } },
    );
    expect(seated.ok()).toBe(true);
    expect((await seated.json()).order.id).toBeTruthy();

    const products = await api.get("/api/v1/catalog/products");
    expect(products.ok()).toBe(true);
    const product = ((await products.json()).data as Array<{ id: string }>)[0];
    expect(product?.id).toBeTruthy();

    const orderResponse = await api.post("/api/v1/pos/orders/open", {
      data: {
        channel: "counter",
        branchId: context.branchId,
        peopleCount: 1,
        idempotencyKey: `e2e-hybrid-open-${Date.now()}`,
      },
    });
    expect(orderResponse.ok()).toBe(true);
    const order = (await orderResponse.json()) as { id: string };
    const itemResponse = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: {
        productId: product?.id,
        quantity: 1,
        idempotencyKey: `e2e-hybrid-item-${Date.now()}`,
      },
    });
    expect(itemResponse.ok()).toBe(true);
    const item = (await itemResponse.json()) as { id: string; totalCents: number };

    const discount = await api.post(`/api/v1/pos/orders/${order.id}/discounts`, {
      data: {
        amountCents: Math.max(1, Math.round(item.totalCents * 0.2)),
        reason: "Validação E2E de limite gerencial",
      },
    });
    expect(discount.ok()).toBe(true);
    const discountPayload = await discount.json();
    expect(discountPayload.status).toBe("pending_approval");

    const approvedDiscount = await api.post(
      `/api/v1/approvals/${discountPayload.approval.id}/approve`,
      { data: { managerPin: "1234", reason: "Aprovado no E2E" } },
    );
    expect(approvedDiscount.ok()).toBe(true);
    expect((await approvedDiscount.json()).status).toBe("approved");

    const cashSummary = await api.get(
      `/api/v1/pos/cash-sessions/summary?branchId=${context.branchId}`,
    );
    expect(cashSummary.ok()).toBe(true);
    if (!(await cashSummary.json()).session) {
      const openedCash = await api.post("/api/v1/pos/cash-sessions/open", {
        data: { branchId: context.branchId, openingAmountCents: 0 },
      });
      expect(openedCash.ok()).toBe(true);
    }

    const cashOrderResponse = await api.post("/api/v1/pos/orders/open", {
      data: {
        channel: "counter",
        branchId: context.branchId,
        peopleCount: 1,
        idempotencyKey: `e2e-cash-open-${Date.now()}`,
      },
    });
    const cashOrder = (await cashOrderResponse.json()) as { id: string };
    const cashItemResponse = await api.post(`/api/v1/pos/orders/${cashOrder.id}/items`, {
      data: {
        productId: product?.id,
        quantity: 1,
        idempotencyKey: `e2e-cash-item-${Date.now()}`,
      },
    });
    const cashItem = (await cashItemResponse.json()) as { totalCents: number };
    const cashPayment = await api.post(`/api/v1/pos/orders/${cashOrder.id}/payments`, {
      data: {
        amountCents: cashItem.totalCents,
        method: "cash",
        idempotencyKey: `cash-handover-e2e-${Date.now()}`,
        registeredVia: "waiter",
      },
    });
    expect(cashPayment.ok()).toBe(true);
    const payment = await cashPayment.json();
    expect(payment.cashHandoverStatus).toBe("pending");

    const received = await api.post(`/api/v1/pos/payments/${payment.id}/cash-handover/receive`, {
      data: {},
    });
    expect(received.ok()).toBe(true);
    expect((await received.json()).cashHandoverStatus).toBe("received");

    await api.dispose();
  });
});
