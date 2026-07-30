import { expect, test } from "@playwright/test";
import {
  authenticateBrowserPage,
  authenticatedApiContext,
  skipWhenApiUnavailable,
} from "./helpers";

test.describe("Hybrid operation UI", () => {
  test("renders salon, policy and cash workspaces without overflow", async ({ page }) => {
    await skipWhenApiUnavailable();
    page.on("pageerror", (error) => console.error(`[browser-pageerror] ${error.stack}`));
    await authenticateBrowserPage(page);

    await page.goto("/app/salon", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Mapa de mesas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reservas e fila de espera" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/hybrid-salon.png", fullPage: true });

    await page.goto("/app/settings/operation", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Políticas e aprovações" })).toBeVisible();
    await expect(page.getByText("Política efetiva")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/hybrid-operation-settings.png", fullPage: true });

    await page.goto("/app/cash", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Turno e caixa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entregas de garçons" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/hybrid-cash.png", fullPage: true });
  });

  test("moves a table with pointer events and persists the floor plan", async ({ page }) => {
    await skipWhenApiUnavailable();
    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const branchId = ((await me.json()).context as { branchId: string }).branchId;
    const initialResponse = await api.get(`/api/v1/pos/floor-plan?branchId=${branchId}`);
    expect(initialResponse.ok()).toBe(true);
    const initialPlan = (await initialResponse.json()) as {
      version: number;
      layout: Record<string, { x: number; y: number }>;
    };

    try {
      await authenticateBrowserPage(page);
      await page.goto("/app/salon", { waitUntil: "networkidle" });
      const table = page.locator(".salon-table").first();
      await expect(table).toBeVisible();
      const initialPosition = await table.evaluate((element) => ({
        left: Number.parseFloat((element as HTMLElement).style.left),
        top: Number.parseFloat((element as HTMLElement).style.top),
      }));
      const bounds = await table.boundingBox();
      expect(bounds).not.toBeNull();

      await page.mouse.move((bounds?.x ?? 0) + 20, (bounds?.y ?? 0) + 20);
      await page.mouse.down();
      await page.mouse.move((bounds?.x ?? 0) + 56, (bounds?.y ?? 0) + 44, { steps: 5 });
      await page.mouse.up();

      const movedPosition = await table.evaluate((element) => ({
        left: Number.parseFloat((element as HTMLElement).style.left),
        top: Number.parseFloat((element as HTMLElement).style.top),
      }));
      expect(movedPosition.left).not.toBeCloseTo(initialPosition.left, 2);
      expect(movedPosition.top).not.toBeCloseTo(initialPosition.top, 2);

      const saveResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/pos/floor-plan") &&
          response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Salvar mapa" }).click();
      expect((await saveResponse).ok()).toBe(true);
      await expect(page.getByText(/Disposição salva na revisão/)).toBeVisible();

      await page.reload({ waitUntil: "networkidle" });
      const persistedTable = page.locator(".salon-table").first();
      await expect(persistedTable).toBeVisible();
      const persistedPosition = await persistedTable.evaluate((element) => ({
        left: Number.parseFloat((element as HTMLElement).style.left),
        top: Number.parseFloat((element as HTMLElement).style.top),
      }));
      expect(persistedPosition.left).toBeCloseTo(movedPosition.left, 2);
      expect(persistedPosition.top).toBeCloseTo(movedPosition.top, 2);
    } finally {
      const latestResponse = await api.get(`/api/v1/pos/floor-plan?branchId=${branchId}`);
      const latestPlan = (await latestResponse.json()) as { version: number };
      const restore = await api.patch("/api/v1/pos/floor-plan", {
        data: {
          branchId,
          expectedVersion: latestPlan.version,
          layout: initialPlan.layout,
        },
      });
      expect(restore.ok()).toBe(true);
      await api.dispose();
    }
  });

  test("opens readable table actions without moving the table", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);
    await page.goto("/app/salon", { waitUntil: "networkidle" });

    const table = page.locator(".salon-table").first();
    await expect(table).toBeVisible();
    const initialPosition = await table.evaluate((element) => ({
      left: (element as HTMLElement).style.left,
      top: (element as HTMLElement).style.top,
    }));

    await table.click();
    const finalPosition = await table.evaluate((element) => ({
      left: (element as HTMLElement).style.left,
      top: (element as HTMLElement).style.top,
    }));
    expect(finalPosition).toEqual(initialPosition);

    const popup = page.locator(".table-action-popup");
    await expect(popup).toBeVisible();
    const colors = await popup.evaluate((element) => {
      const action = element.querySelector<HTMLElement>(".popup-action-btn");
      return {
        background: getComputedStyle(element).backgroundColor,
        action: action ? getComputedStyle(action).color : "",
      };
    });
    expect(colors.background).not.toBe("rgb(255, 255, 255)");
    expect(colors.action).not.toBe("rgb(255, 255, 255)");
  });

  test("aligns and persists tables joined through explicit merge mode", async ({ page }) => {
    await skipWhenApiUnavailable();
    const { api } = await authenticatedApiContext();
    const me = await api.get("/api/v1/auth/me");
    const branchId = ((await me.json()).context as { branchId: string }).branchId;
    const tablesResponse = await api.get(`/api/v1/pos/tables?branchId=${branchId}`);
    const tablesPayload = (await tablesResponse.json()) as {
      data: Array<{ id: string; groupId?: string | null }>;
    };
    const candidates = tablesPayload.data.filter((table) => !table.groupId).slice(0, 2);
    if (candidates.length < 2) {
      await api.dispose();
      test.skip(true, "A demonstração precisa de duas mesas sem grupo para validar a junção.");
    }

    const initialResponse = await api.get(`/api/v1/pos/floor-plan?branchId=${branchId}`);
    const initialPlan = (await initialResponse.json()) as {
      version: number;
      layout: Record<string, { x: number; y: number }>;
    };

    try {
      await authenticateBrowserPage(page);
      await page.goto("/app/salon", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Juntar mesas" }).click();
      for (const table of candidates) {
        await page.locator(`[data-table-id="${table.id}"]`).click();
      }

      const mergeResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/pos/merge-tables") &&
          response.request().method() === "POST",
      );
      const saveResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/pos/floor-plan") &&
          response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Confirmar junção" }).click();
      expect((await mergeResponse).ok()).toBe(true);
      expect((await saveResponse).ok()).toBe(true);

      const positions = await Promise.all(
        candidates.map((table) =>
          page.locator(`[data-table-id="${table.id}"]`).evaluate((element) => ({
            left: Number.parseFloat((element as HTMLElement).style.left),
            top: Number.parseFloat((element as HTMLElement).style.top),
          })),
        ),
      );
      expect(positions[0]?.top).toBeCloseTo(positions[1]?.top ?? 0, 2);
      expect(Math.abs((positions[1]?.left ?? 0) - (positions[0]?.left ?? 0))).toBeGreaterThan(5);
    } finally {
      await api.delete(`/api/v1/pos/unmerge-tables/${candidates[0]?.id}`);
      const latestResponse = await api.get(`/api/v1/pos/floor-plan?branchId=${branchId}`);
      const latestPlan = (await latestResponse.json()) as { version: number };
      await api.patch("/api/v1/pos/floor-plan", {
        data: {
          branchId,
          expectedVersion: latestPlan.version,
          layout: initialPlan.layout,
        },
      });
      await api.dispose();
    }
  });
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) {
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
        )
        .slice(0, 10)
        .map((element) => ({
          className: element.className,
          parentClassName: element.parentElement?.className,
          right: Math.round(element.getBoundingClientRect().right),
          tag: element.tagName,
          text: element.textContent?.trim(),
        })),
    );
    console.error("[horizontal-overflow]", { overflow, offenders });
  }
  expect(overflow).toBeLessThanOrEqual(1);
}
