import type { APIRequestContext, Page } from "@playwright/test";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import { generateTotpCode } from "../../apps/api/src/common/totp";

const apiUrl = process.env.API_URL ?? "http://localhost:3333";

test.describe("GiroMesa commercial and operational flows", () => {
  test("navigates public commercial, trial and QR surfaces", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Gestão que gira. Resultados que ficam." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /(Testar grátis por 7 dias|Começar teste grátis)/i }).first(),
    ).toBeVisible();

    await page.goto("/teste-gratis", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Teste grátis GiroMesa" })).toBeVisible();
    await expect(page.getByText("Sem cartão na criação da conta")).toBeVisible();

    await page.goto("/q/M03", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Bar Aurora" })).toBeVisible();
    await expect(
      page.getByText("Burger Clássico").or(page.getByText("Burger Classico")),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Chamar garçom/i })).toBeVisible();
  });

  test("executes authenticated POS actions through the browser", async ({ page }) => {
    await skipWhenApiUnavailable();

    await authenticateBrowserPage(page);
    await page.goto("/app?view=pos", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Operação conectada")).toBeVisible();
    const addItemButton = page.getByTestId("pos-add-item");
    await expect(addItemButton).toBeEnabled();

    await addItemButton.focus();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/pos/orders/") &&
          response.url().endsWith("/items") &&
          response.ok(),
      ),
      page.keyboard.press("Enter"),
    ]);
    const modifierDialog = page.getByRole("dialog", { name: /Opções de/i });
    if (await modifierDialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await modifierDialog.getByRole("button", { name: "Adicionar ao pedido" }).click();
    }
    await expect(page.getByText(/lançado na comanda|lancado na comanda/i).first()).toBeVisible();
    await expect(page.getByTestId("send-kds")).toBeEnabled();
    await expect(page.getByTestId("payment-complete")).toBeEnabled();
  });

  test("executes catalog, supplier, stock, floor plan, KDS, payment and close order through the API", async () => {
    await skipWhenApiUnavailable();

    const { api } = await authenticatedApiContext();
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

    const modifierGroup = await api.post("/api/v1/catalog/modifier-groups", {
      data: { productId: product.id, name: "Extra E2E", minChoices: 0, maxChoices: 1 },
    });
    expect(modifierGroup.ok()).toBe(true);
    const modifierGroupPayload = await modifierGroup.json();
    const modifierOption = await api.post(
      `/api/v1/catalog/modifier-groups/${modifierGroupPayload.id}/options`,
      { data: { name: "Queijo extra", priceDeltaCents: 400 } },
    );
    expect(modifierOption.ok()).toBe(true);
    const modifierOptionPayload = await modifierOption.json();

    const supplier = await api.post("/api/v1/inventory/suppliers", {
      data: { name: `E2E Fornecedor ${Date.now()}`, phone: "11999999999" },
    });
    expect(supplier.ok()).toBe(true);
    const supplierPayload = await supplier.json();
    const inventoryItem = await api.post("/api/v1/inventory/items", {
      data: {
        name: `E2E Insumo ${Date.now()}`,
        unit: "un",
        averageCostCents: 750,
        minQuantity: "2",
      },
    });
    expect(inventoryItem.ok()).toBe(true);
    const inventoryPayload = await inventoryItem.json();
    const purchase = await api.post("/api/v1/inventory/adjustments", {
      data: {
        branchId: context.branchId,
        supplierId: supplierPayload.id,
        inventoryItemId: inventoryPayload.id,
        type: "purchase_receipt",
        quantity: "8",
        unitCostCents: 750,
        reason: "Compra E2E para validação",
      },
    });
    expect(purchase.ok()).toBe(true);

    const summary = await api.get(`/api/v1/inventory/summary?branchId=${context.branchId}`);
    expect(summary.ok()).toBe(true);
    expect(
      (await summary.json()).data.some(
        (row: { id: string; quantity: string }) =>
          row.id === inventoryPayload.id && Number(row.quantity) >= 8,
      ),
    ).toBe(true);

    const tables = await api.get(`/api/v1/pos/tables?branchId=${context.branchId}`);
    expect(tables.ok()).toBe(true);
    const table = ((await tables.json()).data as { id: string; code: string }[])[0];
    expect(table?.id).toBeTruthy();

    const floorPlan = await api.patch("/api/v1/pos/floor-plan", {
      data: { branchId: context.branchId, layout: { [table.id]: { x: 18, y: 24 } } },
    });
    expect(floorPlan.ok()).toBe(true);
    const floorPlanRead = await api.get(`/api/v1/pos/floor-plan?branchId=${context.branchId}`);
    expect(floorPlanRead.ok()).toBe(true);
    expect((await floorPlanRead.json()).layout[table.id]).toMatchObject({ x: 18, y: 24 });

    const opened = await api.post("/api/v1/pos/orders/open", {
      data: { channel: "table", branchId: context.branchId, tableId: table.id, peopleCount: 2 },
    });
    expect(opened.ok()).toBe(true);
    const order = await opened.json();

    const item = await api.post(`/api/v1/pos/orders/${order.id}/items`, {
      data: {
        productId: product.id,
        quantity: 1,
        notes: "Sem cebola",
        modifiers: [{ optionId: modifierOptionPayload.id }],
      },
    });
    expect(item.ok()).toBe(true);
    const orderItem = await item.json();
    expect(orderItem.audit).toBe("order.item_added");
    expect(orderItem.unitPriceCents).toBe(4300);

    const sent = await api.post(`/api/v1/pos/orders/${order.id}/send-to-kitchen`);
    expect(sent.ok()).toBe(true);
    expect((await sent.json()).ticketsCreated.length).toBeGreaterThan(0);

    const payment = await api.post(`/api/v1/pos/orders/${order.id}/payments`, {
      data: {
        amountCents: orderItem.totalCents,
        method: "pix_manual",
        idempotencyKey: `e2e-${Date.now()}`,
      },
    });
    expect(payment.ok()).toBe(true);
    expect((await payment.json()).orderStatus).toBe("paid");

    const closed = await api.post(`/api/v1/pos/orders/${order.id}/close`);
    expect(closed.ok()).toBe(true);
    expect((await closed.json()).audit).toBe("order.closed");

    await api.dispose();
  });

  test("reviews QR order, cancels one item and sends the remaining item to KDS", async () => {
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

    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const context = (await me.json()).context as { branchId: string };

    const pending = await api.get(`/api/v1/pos/orders/qr-pending?branchId=${context.branchId}`);
    expect(pending.ok()).toBe(true);
    const order = (
      (await pending.json()) as {
        data: { id: string; tableId: string; items: { id: string }[] }[];
      }
    ).data.find((row) => row.id === qrOrderPayload.orderId);
    expect(order?.items).toHaveLength(2);

    const canceled = await api.post(
      `/api/v1/pos/orders/${qrOrderPayload.orderId}/qr-items/${order?.items[1]?.id}/cancel`,
      { data: { reason: "E2E QR item indisponível" } },
    );
    expect(canceled.ok()).toBe(true);

    const sent = await api.post(`/api/v1/pos/orders/${qrOrderPayload.orderId}/send-to-kitchen`);
    expect(sent.ok()).toBe(true);
    expect((await sent.json()).ticketsCreated.length).toBeGreaterThan(0);

    const history = await api.get(`/api/v1/pos/tables/${order?.tableId}/history?limit=12`);
    expect(history.ok()).toBe(true);
    const historyRows = (await history.json()).data as { action: string }[];
    expect(historyRows.some((event) => event.action === "qr_order.item_canceled")).toBe(true);

    await api.dispose();
  });

  test("manages invitations, accepts access, assigns role and changes password", async () => {
    await skipWhenApiUnavailable();

    const { api: adminApi } = await authenticatedApiContext();
    const roles = ((await (await adminApi.get("/api/v1/auth/roles")).json()).data ?? []) as {
      id: string;
      code: string;
    }[];
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

    const accepted = await adminApi.post("/api/v1/auth/invitations/accept", {
      data: { token: invitation.tokenReturnedOnce, name: "E2E Usuário", password: "StrongPass1!" },
    });
    expect(accepted.ok()).toBe(true);
    const acceptedCookie = accepted.headers()["set-cookie"];
    const acceptedApi = await apiContextFromCookie(acceptedCookie);

    const changePassword = await acceptedApi.post("/api/v1/auth/password/change", {
      data: { currentPassword: "StrongPass1!", newPassword: "StrongerPass2!" },
    });
    expect(changePassword.ok()).toBe(true);

    const mfaSetup = await acceptedApi.post("/api/v1/auth/mfa/setup");
    expect(mfaSetup.ok()).toBe(true);
    const mfaSetupPayload = (await mfaSetup.json()) as { manualKey: string; qrCodeDataUrl: string };
    expect(mfaSetupPayload.qrCodeDataUrl).toContain("data:image/png;base64,");

    const mfaVerify = await acceptedApi.post("/api/v1/auth/mfa/verify", {
      data: { code: generateTotpCode(mfaSetupPayload.manualKey) },
    });
    expect(mfaVerify.ok()).toBe(true);
    expect(((await mfaVerify.json()) as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(8);
    await acceptedApi.dispose();

    const users = ((await (await adminApi.get("/api/v1/auth/users")).json()).data ?? []) as {
      id: string;
      email: string;
    }[];
    const createdUser = users.find((user) => user.email === email);
    expect(createdUser?.id).toBeTruthy();

    const assigned = await adminApi.post(`/api/v1/auth/users/${createdUser?.id}/roles`, {
      data: { roleId: role.id },
    });
    expect(assigned.ok()).toBe(true);

    const audit = await adminApi.get("/api/v1/audit/events?action=invitation.accepted");
    expect(audit.ok()).toBe(true);
    expect(
      ((await audit.json()).data as { action: string }[]).some(
        (event) => event.action === "invitation.accepted",
      ),
    ).toBe(true);

    await adminApi.dispose();
  });

  test("routes restaurant and SaaS owner login to the right workspace", async ({ page }) => {
    await skipWhenApiUnavailable();

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await loginViaUi(page, "owner@giromesa.local", "Platform@12345");
    await expect(page).toHaveURL(/\/platform/);
    await expect(page.getByRole("heading", { name: "Backoffice SaaS" })).toBeVisible();

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await loginViaUi(page, "admin@bar-aurora-demo.local", "Demo@12345");
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByTestId("workspace-dashboard")).toBeVisible();
  });

  test("reviews waiter, reports, billing, manual and security surfaces", async ({ page }) => {
    await skipWhenApiUnavailable();

    await authenticateBrowserPage(page);

    await page.goto("/app/waiter", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Modo garçom" })).toBeVisible();
    await expect(page.getByTestId("waiter-open-table")).toBeVisible();

    await page.goto("/app/reports", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Relatórios do turno" })).toBeVisible();
    await expect(page.getByText("Radar executivo")).toBeVisible();
    await expect(page.getByLabel("Filtrar por método")).toBeVisible();

    await page.goto("/app/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Assinatura GiroMesa/i })).toBeVisible();

    await page.goto("/app/security", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Conta e segundo fator" })).toBeVisible();

    await page.goto("/manual", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Como operar o GiroMesa/i })).toBeVisible();
  });

  test("provisions platform tenant with invitation and blocks suspended tenant access", async () => {
    await skipWhenApiUnavailable();

    const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    const publicTenantSignup = await publicApi.post("/api/v1/tenants", {
      data: {
        name: "Public Signup Blocked",
        ownerName: "Public Owner",
        ownerEmail: "public-owner@example.com",
        ownerPassword: "PublicPass1!",
      },
    });
    expect(publicTenantSignup.status()).toBe(403);
    await publicApi.dispose();

    const { api: platformApi } = await authenticatedApiContext(
      "owner@giromesa.local",
      "Platform@12345",
    );
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
      invitation: { acceptUrl: string; tokenReturnedOnce: string; delivery: string } | null;
    };
    expect(createdPayload.invitation?.tokenReturnedOnce).toBeTruthy();

    const ownerPassword = `TenantPass${suffix}!`;
    const accepted = await platformApi.post("/api/v1/auth/invitations/accept", {
      data: {
        token: createdPayload.invitation?.tokenReturnedOnce,
        name: "E2E Owner",
        password: ownerPassword,
      },
    });
    expect(accepted.ok()).toBe(true);

    const suspended = await platformApi.patch(
      `/api/v1/platform/tenants/${createdPayload.tenant.id}/status`,
      { data: { status: "suspended" } },
    );
    expect(suspended.ok()).toBe(true);

    const blockedLogin = await platformApi.post("/api/v1/auth/login", {
      data: { email: createdPayload.owner.email, password: ownerPassword },
    });
    expect(blockedLogin.status()).toBe(401);

    await platformApi.dispose();
  });
});

async function skipWhenApiUnavailable() {
  const health = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const response = await health.get("/health", { timeout: 2_500 });
    test.skip(!response.ok(), "API local indisponível; rode Docker, migrations, seed e API dev.");
  } catch {
    test.skip(true, "API local indisponível; rode Docker, migrations, seed e API dev.");
  } finally {
    await health.dispose();
  }
}

async function authenticateBrowserPage(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await loginViaUi(page, "admin@bar-aurora-demo.local", "Demo@12345");
  await expect(page).toHaveURL(/\/app/);
}

async function authenticatedApiContext(
  email = "admin@bar-aurora-demo.local",
  password = "Demo@12345",
) {
  const loginApi = await playwrightRequest.newContext({ baseURL: apiUrl });
  const login = await loginApi.post("/api/v1/auth/login", { data: { email, password } });
  expect(login.ok()).toBe(true);
  const cookie = login.headers()["set-cookie"];
  expect(cookie).toContain("gm_session=");
  await loginApi.dispose();
  return { cookie, api: await apiContextFromCookie(cookie) };
}

async function apiContextFromCookie(cookie: string): Promise<APIRequestContext> {
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

async function loginViaUi(page: Page, email: string, password: string) {
  await expect(page.getByTestId("login-submit")).toBeEnabled();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/v1/auth/login") && response.status() < 500,
    ),
    page.getByTestId("login-submit").click(),
  ]);
}
