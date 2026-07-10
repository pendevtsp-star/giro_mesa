import type { Page } from "@playwright/test";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import { generateTotpCode } from "../../apps/api/src/common/totp";

const apiUrl = process.env.API_URL ?? "http://localhost:3333";

test.describe("GiroMesa demo experience", () => {
  test("navigates the polished public and operations surfaces", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "GiroMesa" })).toBeVisible();
    await expect(page.getByText("Turno jantar em andamento")).toBeVisible();

    await page.getByRole("link", { name: /Abrir demo operacional/ }).click();
    await expect(page.getByTestId("demo-dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Turno jantar" })).toBeVisible();
    await expect(page.getByTestId("pos-open-table")).toBeVisible();
    await expect(page.getByTestId("pos-add-item")).toBeVisible();
    await expect(page.getByTestId("kds-ticket")).toHaveCount(4);
    await expect(page.getByTestId("payment-complete")).toBeVisible();
    await expect(page.getByTestId("cash-close")).toBeVisible();

    await page.goto("/q/M03", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Bar Aurora" })).toBeVisible();
    await page.getByRole("link", { name: /Ver cardapio/ }).click();
    await expect(page.getByRole("heading", { name: "Bar Aurora" })).toBeVisible();
    await expect(page.getByText("Burger Classico")).toBeVisible();
  });

  test("executes authenticated POS actions through the browser", async ({ page }) => {
    await skipWhenApiUnavailable();

    await authenticateBrowserPage(page);
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("API conectada")).toBeVisible();

    await page.getByTestId("pos-add-item").click();
    await expect(page.getByText(/lancado na comanda/).first()).toBeVisible();

    await page.getByTestId("send-kds").click();
    await expect(page.getByText(/ticket\(s\) enviados para KDS/).first()).toBeVisible();

    await page.getByTestId("payment-complete").click();
    await expect(page.getByText(/Pagamento pix_manual confirmado/).first()).toBeVisible();

    await page.getByTestId("cash-close").click();
    await expect(page.getByText(/Conta fechada/).first()).toBeVisible();
  });

  test("executes login, catalog, table, KDS, payment and close order through the API", async () => {
    await skipWhenApiUnavailable();

    const unauthenticated = await playwrightRequest.newContext({ baseURL: apiUrl });
    const login = await unauthenticated.post("/api/v1/auth/login", {
      data: {
        email: "admin@bar-aurora-demo.local",
        password: "Demo@12345",
      },
    });
    expect(login.ok()).toBe(true);

    const cookie = login.headers()["set-cookie"];
    expect(cookie).toContain("gm_session=");
    await unauthenticated.dispose();

    const api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: {
        cookie,
      },
    });

    const me = await api.get("/api/v1/auth/me");
    expect(me.ok()).toBe(true);
    const context = (await me.json()).context as { branchId: string };
    expect(context.branchId).toBeTruthy();

    const productName = `E2E Prato ${Date.now()}`;
    const createdProduct = await api.post("/api/v1/catalog/products", {
      data: {
        name: productName,
        description: "Produto criado pelo fluxo E2E.",
        priceCents: 3900,
        costCents: 1200,
        channels: ["pos", "qr"],
      },
    });
    expect(createdProduct.ok()).toBe(true);
    const product = await createdProduct.json();
    expect(product.name).toBe(productName);

    const products = await api.get("/api/v1/catalog/products");
    expect(products.ok()).toBe(true);
    const productRows = (await products.json()).data as { id: string; name: string }[];
    expect(productRows.some((row) => row.name === productName)).toBe(true);

    const tables = await api.get(`/api/v1/pos/tables?branchId=${context.branchId}`);
    expect(tables.ok()).toBe(true);
    const tableRows = (await tables.json()).data as { id: string; code: string }[];
    const table = tableRows[0];
    expect(table?.id).toBeTruthy();

    const opened = await api.post("/api/v1/pos/orders/open", {
      data: {
        channel: "table",
        branchId: context.branchId,
        tableId: table.id,
        peopleCount: 2,
      },
    });
    expect(opened.ok()).toBe(true);
    const order = await opened.json();
    expect(order.audit).toBe("order.opened");

    const item = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: {
        productId: product.id,
        quantity: 1,
        notes: "Sem cebola",
      },
    });
    expect(item.ok()).toBe(true);
    const orderItem = await item.json();
    expect(orderItem.audit).toBe("order.item_added");

    const sent = await api.post(`/api/v1/pos/orders/${order.id}/send-to-kitchen`);
    expect(sent.ok()).toBe(true);
    const sentPayload = await sent.json();
    expect(sentPayload.audit).toBe("order.sent_to_kitchen");
    expect(sentPayload.ticketsCreated.length).toBeGreaterThan(0);

    const tickets = await api.get("/api/v1/kds/tickets");
    expect(tickets.ok()).toBe(true);
    const ticketRows = (await tickets.json()).data as { orderId: string }[];
    expect(ticketRows.some((ticket) => ticket.orderId === order.id)).toBe(true);

    const payment = await api.post(`/api/v1/pos/orders/${order.id}/payments`, {
      data: {
        amountCents: orderItem.totalCents,
        method: "pix_manual",
        idempotencyKey: `e2e-${Date.now()}`,
      },
    });
    expect(payment.ok()).toBe(true);
    const paid = await payment.json();
    expect(paid.orderStatus).toBe("paid");

    const closed = await api.post(`/api/v1/pos/orders/${order.id}/close`);
    expect(closed.ok()).toBe(true);
    expect((await closed.json()).audit).toBe("order.closed");

    await api.dispose();
  });

  test("reviews a QR order, cancels one item and sends the remaining item to KDS", async () => {
    await skipWhenApiUnavailable();

    const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    const menu = await publicApi.get("/api/v1/catalog/public/menu/bar-aurora-demo");
    expect(menu.ok()).toBe(true);
    const menuPayload = (await menu.json()) as {
      products: { id: string; name: string; isAvailable: boolean; channels: string[] }[];
    };
    const qrProducts = menuPayload.products
      .filter((product) => product.isAvailable && product.channels.includes("qr"))
      .slice(0, 2);
    expect(qrProducts).toHaveLength(2);

    const qrOrder = await publicApi.post("/api/v1/catalog/public/qr/M03/orders", {
      data: {
        tenantSlug: "bar-aurora-demo",
        items: [
          { productId: qrProducts[0]?.id, quantity: 1, notes: "E2E QR manter" },
          { productId: qrProducts[1]?.id, quantity: 1, notes: "E2E QR cancelar" },
        ],
      },
    });
    expect(qrOrder.ok()).toBe(true);
    const qrOrderPayload = (await qrOrder.json()) as { orderId: string };
    await publicApi.dispose();

    const unauthenticated = await playwrightRequest.newContext({ baseURL: apiUrl });
    const login = await unauthenticated.post("/api/v1/auth/login", {
      data: {
        email: "admin@bar-aurora-demo.local",
        password: "Demo@12345",
      },
    });
    expect(login.ok()).toBe(true);
    const cookie = login.headers()["set-cookie"];
    await unauthenticated.dispose();

    const api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { cookie },
    });
    const me = await api.get("/api/v1/auth/me");
    expect(me.ok()).toBe(true);
    const context = (await me.json()).context as { branchId: string };

    const pending = await api.get(`/api/v1/pos/orders/qr-pending?branchId=${context.branchId}`);
    expect(pending.ok()).toBe(true);
    const pendingPayload = (await pending.json()) as {
      data: {
        id: string;
        tableId: string;
        items: { id: string; nameSnapshot: string; totalCents: number }[];
      }[];
    };
    const order = pendingPayload.data.find((row) => row.id === qrOrderPayload.orderId);
    expect(order?.items).toHaveLength(2);

    const itemToCancel = order?.items[1];
    expect(itemToCancel?.id).toBeTruthy();
    const canceled = await api.post(
      `/api/v1/pos/orders/${qrOrderPayload.orderId}/qr-items/${itemToCancel?.id}/cancel`,
      { data: { reason: "E2E QR item indisponivel" } },
    );
    expect(canceled.ok()).toBe(true);
    expect((await canceled.json()).audit).toBe("qr_order.item_canceled");

    const pendingAfterCancel = await api.get(
      `/api/v1/pos/orders/qr-pending?branchId=${context.branchId}`,
    );
    expect(pendingAfterCancel.ok()).toBe(true);
    const orderAfterCancel = ((await pendingAfterCancel.json()) as typeof pendingPayload).data.find(
      (row) => row.id === qrOrderPayload.orderId,
    );
    expect(orderAfterCancel?.items).toHaveLength(1);

    const sent = await api.post(`/api/v1/pos/orders/${qrOrderPayload.orderId}/send-to-kitchen`);
    expect(sent.ok()).toBe(true);
    const sentPayload = await sent.json();
    expect(sentPayload.audit).toBe("order.sent_to_kitchen");
    expect(sentPayload.ticketsCreated.length).toBeGreaterThan(0);

    const history = await api.get(`/api/v1/pos/tables/${order?.tableId}/history?limit=12`);
    expect(history.ok()).toBe(true);
    const historyRows = (await history.json()).data as {
      action: string;
      userName: string | null;
    }[];
    expect(historyRows.some((event) => event.action === "qr_order.item_canceled")).toBe(true);
    expect(historyRows.some((event) => event.action === "order.sent_to_kitchen")).toBe(true);

    await api.dispose();
  });

  test("manages invitations, accepts access, assigns role and changes password", async () => {
    await skipWhenApiUnavailable();

    const adminApi = await authenticatedApiContext();
    const rolesResponse = await adminApi.get("/api/v1/auth/roles");
    expect(rolesResponse.ok()).toBe(true);
    const roles = (await rolesResponse.json()).data as { id: string; code: string }[];
    const role = roles.find((entry) => entry.code === "owner") ?? roles[0];
    expect(role?.id).toBeTruthy();

    const email = `e2e-user-${Date.now()}@example.com`;
    const createdInvitation = await adminApi.post("/api/v1/auth/invitations", {
      data: { email, roleId: role.id },
    });
    expect(createdInvitation.ok()).toBe(true);
    const invitation = (await createdInvitation.json()) as {
      id: string;
      tokenReturnedOnce: string;
    };
    expect(invitation.tokenReturnedOnce).toBeTruthy();

    const accepted = await adminApi.post("/api/v1/auth/invitations/accept", {
      data: {
        token: invitation.tokenReturnedOnce,
        name: "E2E Usuario",
        password: "StrongPass1!",
      },
    });
    expect(accepted.ok()).toBe(true);
    const acceptedCookie = accepted.headers()["set-cookie"];
    expect(acceptedCookie).toContain("gm_session=");

    const acceptedApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { cookie: acceptedCookie },
    });
    const changePassword = await acceptedApi.post("/api/v1/auth/password/change", {
      data: {
        currentPassword: "StrongPass1!",
        newPassword: "StrongerPass2!",
      },
    });
    expect(changePassword.ok()).toBe(true);

    const mfaSetup = await acceptedApi.post("/api/v1/auth/mfa/setup");
    expect(mfaSetup.ok()).toBe(true);
    const mfaSetupPayload = (await mfaSetup.json()) as {
      manualKey: string;
      qrCodeDataUrl: string;
    };
    expect(mfaSetupPayload.qrCodeDataUrl).toContain("data:image/png;base64,");
    const mfaVerify = await acceptedApi.post("/api/v1/auth/mfa/verify", {
      data: { code: generateTotpCode(mfaSetupPayload.manualKey) },
    });
    expect(mfaVerify.ok()).toBe(true);
    const mfaVerifyPayload = (await mfaVerify.json()) as {
      provider: string;
      recoveryCodes: string[];
    };
    expect(mfaVerifyPayload.provider).toBe("totp");
    expect(mfaVerifyPayload.recoveryCodes).toHaveLength(8);
    await acceptedApi.dispose();

    const usersResponse = await adminApi.get("/api/v1/auth/users");
    expect(usersResponse.ok()).toBe(true);
    const users = (await usersResponse.json()).data as { id: string; email: string }[];
    const createdUser = users.find((user) => user.email === email);
    expect(createdUser?.id).toBeTruthy();

    const assigned = await adminApi.post(`/api/v1/auth/users/${createdUser?.id}/roles`, {
      data: { roleId: role.id },
    });
    expect(assigned.ok()).toBe(true);

    const resetRequest = await adminApi.post("/api/v1/auth/password/reset/request", {
      data: { email },
    });
    expect(resetRequest.ok()).toBe(true);
    const resetPayload = (await resetRequest.json()) as { tokenReturnedOnce: string };
    expect(resetPayload.tokenReturnedOnce).toBeTruthy();

    const resetComplete = await adminApi.post("/api/v1/auth/password/reset/complete", {
      data: {
        token: resetPayload.tokenReturnedOnce,
        password: "ResetPass3!",
      },
    });
    expect(resetComplete.ok()).toBe(true);

    const cancelInvitationResponse = await adminApi.post("/api/v1/auth/invitations", {
      data: { email: `e2e-cancel-${Date.now()}@example.com`, roleId: role.id },
    });
    expect(cancelInvitationResponse.ok()).toBe(true);
    const cancelInvitation = (await cancelInvitationResponse.json()) as { id: string };

    const resent = await adminApi.post(`/api/v1/auth/invitations/${cancelInvitation.id}/resend`);
    expect(resent.ok()).toBe(true);
    expect((await resent.json()).tokenReturnedOnce).toBeTruthy();

    const canceled = await adminApi.post(`/api/v1/auth/invitations/${cancelInvitation.id}/cancel`);
    expect(canceled.ok()).toBe(true);
    expect((await canceled.json()).status).toBe("expired");

    const audit = await adminApi.get("/api/v1/audit/events?action=invitation.accepted");
    expect(audit.ok()).toBe(true);
    const auditRows = (await audit.json()).data as { action: string }[];
    expect(auditRows.some((event) => event.action === "invitation.accepted")).toBe(true);

    await adminApi.dispose();
  });

  test("routes restaurant and SaaS owner login to the right workspace", async ({ page }) => {
    await skipWhenApiUnavailable();

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Dono SaaS/ }).click();
    await expect(page.getByRole("heading", { name: "Entre no backoffice SaaS." })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveValue("owner@giromesa.local");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/platform/);
    await expect(page.getByRole("heading", { name: "Backoffice SaaS" })).toBeVisible();

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Restaurante/ }).click();
    await expect(page.getByRole("heading", { name: "Entre no painel da operacao." })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveValue("admin@bar-aurora-demo.local");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByTestId("demo-dashboard")).toBeVisible();
  });

  test("reviews waiter, reports, manual and security surfaces", async ({ page }) => {
    await skipWhenApiUnavailable();

    await authenticateBrowserPage(page);

    await page.goto("/app/waiter", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Modo garçom" })).toBeVisible();
    await expect(page.getByText("Mesas livres")).toBeVisible();
    await expect(page.getByTestId("waiter-open-table")).toBeVisible();

    await page.goto("/app/reports", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Relatórios do turno" })).toBeVisible();
    await expect(page.getByText("Radar executivo")).toBeVisible();
    await expect(page.getByLabel("Filtrar por metodo")).toBeVisible();

    await page.goto("/app/security", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Conta e segundo fator" })).toBeVisible();
    await expect(page.getByText("Checklist de release")).toBeVisible();

    await page.goto("/manual", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Como operar o GiroMesa/i })).toBeVisible();
    await expect(page.getByText("Plano de onboarding recomendado")).toBeVisible();
  });

  test("provisions platform tenant with invitation and blocks suspended tenant access", async () => {
    await skipWhenApiUnavailable();

    const unauthenticated = await playwrightRequest.newContext({ baseURL: apiUrl });
    const publicTenantSignup = await unauthenticated.post("/api/v1/tenants", {
      data: {
        name: "Public Signup Blocked",
        ownerName: "Public Owner",
        ownerEmail: "public-owner@example.com",
        ownerPassword: "PublicPass1!",
      },
    });
    expect(publicTenantSignup.status()).toBe(403);

    const platformLogin = await unauthenticated.post("/api/v1/auth/login", {
      data: {
        email: "owner@giromesa.local",
        password: "Platform@12345",
      },
    });
    expect(platformLogin.ok()).toBe(true);
    const platformCookie = platformLogin.headers()["set-cookie"];
    await unauthenticated.dispose();

    const platformApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { cookie: platformCookie },
    });

    const suffix = Date.now();
    const created = await platformApi.post("/api/v1/platform/tenants", {
      data: {
        name: `E2E Tenant ${suffix}`,
        ownerName: "E2E Owner",
        ownerEmail: `owner-${suffix}@tenant.local`,
        planCode: "professional",
      },
    });
    expect(created.ok()).toBe(true);
    const createdPayload = (await created.json()) as {
      tenant: { id: string; name: string };
      owner: { email: string };
      temporaryPassword: string;
      invitation: { acceptUrl: string; tokenReturnedOnce: string; delivery: string } | null;
    };
    expect(createdPayload.tenant.name).toContain("E2E Tenant");
    expect(createdPayload.invitation?.tokenReturnedOnce).toBeTruthy();
    expect(createdPayload.invitation?.acceptUrl).toContain("/invite/");
    expect(createdPayload.invitation?.delivery).toBe("mock");

    const suspended = await platformApi.patch(
      `/api/v1/platform/tenants/${createdPayload.tenant.id}/status`,
      { data: { status: "suspended" } },
    );
    expect(suspended.ok()).toBe(true);

    const blockedLogin = await platformApi.post("/api/v1/auth/login", {
      data: {
        email: createdPayload.owner.email,
        password: createdPayload.temporaryPassword,
      },
    });
    expect(blockedLogin.status()).toBe(401);

    await platformApi.dispose();
  });
});

async function skipWhenApiUnavailable() {
  const health = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const response = await health.get("/health", { timeout: 2_500 });
    test.skip(!response.ok(), "API local indisponivel; rode docker, migrations, seed e api dev.");
  } catch {
    test.skip(true, "API local indisponivel; rode docker, migrations, seed e api dev.");
  } finally {
    await health.dispose();
  }
}

async function authenticateBrowserPage(page: Page) {
  const unauthenticated = await playwrightRequest.newContext({ baseURL: apiUrl });
  const login = await unauthenticated.post("/api/v1/auth/login", {
    data: {
      email: "admin@bar-aurora-demo.local",
      password: "Demo@12345",
    },
  });
  expect(login.ok()).toBe(true);

  const cookieHeader = login.headers()["set-cookie"];
  const sessionToken = cookieHeader.match(/gm_session=([^;]+)/)?.[1];
  expect(sessionToken).toBeTruthy();
  await page.context().addCookies([
    {
      name: "gm_session",
      value: sessionToken ?? "",
      url: apiUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await unauthenticated.dispose();
}

async function authenticatedApiContext() {
  const unauthenticated = await playwrightRequest.newContext({ baseURL: apiUrl });
  const login = await unauthenticated.post("/api/v1/auth/login", {
    data: {
      email: "admin@bar-aurora-demo.local",
      password: "Demo@12345",
    },
  });
  expect(login.ok()).toBe(true);
  const cookie = login.headers()["set-cookie"];
  await unauthenticated.dispose();

  return playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { cookie },
  });
}
