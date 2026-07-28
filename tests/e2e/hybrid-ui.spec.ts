import { expect, test } from "@playwright/test";
import { authenticateBrowserPage, skipWhenApiUnavailable } from "./helpers";

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
