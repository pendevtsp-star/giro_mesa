import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  authenticateBrowserPage,
  authenticatePlatformPage,
  skipWhenApiUnavailable,
} from "./helpers";

const enabled = process.env.VISUAL_AUDIT === "1";
const webUrl = process.env.WEB_URL ?? "http://localhost:3004";

const adminRoutes = [
  "/app",
  "/app/salon",
  "/app/pos",
  "/app/waiter",
  "/app/kds",
  "/app/cash",
  "/app/qr",
  "/app/catalog",
  "/app/catalog/advanced",
  "/app/inventory",
  "/app/inventory/suppliers",
  "/app/inventory/purchases",
  "/app/customers",
  "/app/delivery",
  "/app/reports",
  "/app/team",
  "/app/team/organization",
  "/app/team/settlements",
  "/app/onboarding",
  "/app/printing",
  "/app/fiscal",
  "/app/settings/payments",
  "/app/finance/payment-reconciliation",
  "/app/outbox",
  "/app/audit",
  "/app/security",
  "/app/billing",
  "/app/settings/branding",
  "/app/settings/operation",
  "/app/settings/branch-structure",
  "/app/integrations/dose-club",
] as const;

const publicRoutes = [
  "/",
  "/login",
  "/m/bar-aurora-demo",
  "/q/M03",
  "/manual",
  "/suporte",
  "/status",
  "/teste-gratis",
  "/termos",
  "/privacidade",
  "/cookies",
  "/cancelamento",
  "/seguranca",
  "/suboperadores",
  "/contato",
] as const;

const platformRoutes = ["/platform", "/platform/support"] as const;

const viewports = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "tablet-landscape", width: 1024, height: 768 },
  { label: "tablet-portrait", width: 768, height: 1024 },
  { label: "mobile", width: 390, height: 844 },
] as const;

const themes = [
  { label: "light", preference: "light", colorScheme: "light" },
  { label: "dark", preference: "dark", colorScheme: "dark" },
  { label: "system-light", preference: "system", colorScheme: "light" },
  { label: "system-dark", preference: "system", colorScheme: "dark" },
] as const;

test.describe("Visual route audit", () => {
  test.skip(!enabled, "Set VISUAL_AUDIT=1 to capture the complete route matrix.");
  test.describe.configure({ timeout: 900_000 });

  test("binds the visual matrix to the current Next build and its assets", async ({ request }) => {
    const startMode = process.env.GIROMESA_QA_START_MODE;
    const startCommand = process.env.GIROMESA_QA_START_COMMAND;
    expect(startMode).toBe("next-start");
    expect(startCommand).toMatch(/(?:^|\s)(?:next\s+start|@giromesa\/web\s+start)(?:\s|$)/);
    expect(startCommand).not.toMatch(/(?:^|\s)next\s+dev(?:\s|$)/);
    const nextDistDir = process.env.NEXT_DIST_DIR ?? ".next";
    const buildId = (await readFile(`apps/web/${nextDistDir}/BUILD_ID`, "utf8")).trim();
    expect(buildId).not.toBe("");
    const htmlResponse = await request.get(webUrl);
    expect(htmlResponse.ok()).toBe(true);
    const html = await htmlResponse.text();
    const assetPaths = [
      ...new Set([
        ...[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map((match) => match[1]?.replaceAll("&amp;", "&") ?? "")
          .filter((path) => path.startsWith("/_next/")),
        `/_next/static/${encodeURIComponent(buildId)}/_buildManifest.js`,
      ]),
    ];
    const assets = [];
    for (const path of assetPaths) {
      const response = await request.get(new URL(path, webUrl).toString());
      assets.push({ path, status: response.status() });
    }
    expect(assets.filter((asset) => asset.status >= 400)).toEqual([]);
    const sourceHash = await visualSourceHash();
    await mkdir("test-results/visual-audit", { recursive: true });
    await writeFile(
      "test-results/visual-audit/build-identity.json",
      `${JSON.stringify(
        {
          assets,
          buildId,
          sourceHash,
          startCommand,
          startMode,
        },
        null,
        2,
      )}\n`,
    );
  });

  test("audits mobile shell preferences as an accessible drawer", async ({ browser }) => {
    await skipWhenApiUnavailable();
    const context = await browser.newContext({
      baseURL: webUrl,
      colorScheme: "dark",
      hasTouch: true,
      viewport: viewports[3],
    });
    await context.addInitScript(() => localStorage.setItem("gm_theme", "system"));
    const page = await context.newPage();
    try {
      await authenticateBrowserPage(page);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      const trigger = page.getByRole("button", { name: "Abrir preferências" });
      await trigger.click();
      const drawer = page.getByRole("dialog", { name: "Preferências" });
      await auditOpenDialog(page, drawer, {
        screenshotPath: "test-results/visual-audit/focused/mobile-shell-preferences.png",
        trigger,
      });
    } finally {
      await context.close();
    }
  });

  test("audits POS, approval and delivery overlays", async ({ browser }) => {
    await skipWhenApiUnavailable();
    const context = await browser.newContext({
      baseURL: webUrl,
      colorScheme: "light",
      viewport: viewports[0],
    });
    await context.addInitScript(() => localStorage.setItem("gm_theme", "light"));
    const page = await context.newPage();
    try {
      await authenticateBrowserPage(page);
      await auditPosOverlays(page);
      await auditApprovalPin(page);
      await auditDeliveryCancel(page);
    } finally {
      await context.close();
    }
  });

  test("audits the global command dialog", async ({ browser }) => {
    test.setTimeout(60_000);
    await skipWhenApiUnavailable();
    const context = await browser.newContext({
      baseURL: webUrl,
      colorScheme: "light",
      viewport: viewports[0],
    });
    const page = await context.newPage();
    try {
      await authenticateBrowserPage(page);
      await auditCommandDialog(page, "focused");
    } finally {
      await context.close();
    }
  });

  test("audits QR age and modifier dialogs", async ({ page }) => {
    await auditQrDialogs(page);
  });

  for (const viewport of viewports) {
    for (const theme of themes) {
      const profile = `${viewport.label}-${theme.label}`;

      test(`audits authenticated routes for ${profile}`, async ({ browser }) => {
        await skipWhenApiUnavailable();
        const context = await browser.newContext({
          baseURL: webUrl,
          colorScheme: theme.colorScheme,
          hasTouch: viewport.width <= 1024,
          viewport,
        });
        await context.addInitScript(
          ({ preference }) => localStorage.setItem("gm_theme", preference),
          { preference: theme.preference },
        );
        const page = await context.newPage();
        try {
          await authenticateBrowserPage(page);
          await auditRoutes(page, adminRoutes, profile, viewport.width <= 1024);
        } finally {
          await context.close();
        }
      });

      test(`audits public routes for ${profile}`, async ({ browser }) => {
        const context = await browser.newContext({
          baseURL: webUrl,
          colorScheme: theme.colorScheme,
          hasTouch: viewport.width <= 1024,
          viewport,
        });
        await context.addInitScript(
          ({ preference }) => localStorage.setItem("gm_theme", preference),
          { preference: theme.preference },
        );
        const page = await context.newPage();
        try {
          await auditRoutes(page, publicRoutes, profile, viewport.width <= 1024);
        } finally {
          await context.close();
        }
      });

      if (viewport === viewports[0] || viewport === viewports[3]) {
        test(`audits platform routes for ${profile}`, async ({ browser }) => {
          await skipWhenApiUnavailable();
          const context = await browser.newContext({
            baseURL: webUrl,
            colorScheme: theme.colorScheme,
            hasTouch: viewport.width <= 1024,
            viewport,
          });
          await context.addInitScript(
            ({ preference }) => localStorage.setItem("gm_theme", preference),
            { preference: theme.preference },
          );
          const page = await context.newPage();
          try {
            await authenticatePlatformPage(page);
            await auditRoutes(page, platformRoutes, profile, viewport.width <= 1024);
          } finally {
            await context.close();
          }
        });
      }
    }
  }
});

async function auditRoutes(
  page: import("@playwright/test").Page,
  routes: readonly string[],
  viewportLabel: string,
  auditTouchTargets: boolean,
) {
  for (const route of routes) {
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];
    const onPageError = (error: Error) => pageErrors.push(error.message);
    const onResponse = (response: import("@playwright/test").Response) => {
      if (response.status() >= 500) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    };

    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    await page.goto(route, { waitUntil: "domcontentloaded" });
    if (route.startsWith("/app")) {
      await page
        .locator(".access-boundary-page")
        .waitFor({ state: "detached", timeout: 10_000 })
        .catch(() => {});
    }
    await page.waitForTimeout(300);

    const slug = route === "/" ? "landing" : route.replace(/^\/|\/$/g, "").replaceAll("/", "-");
    await page.screenshot({
      path: `test-results/visual-audit/${viewportLabel}/${slug}.png`,
      fullPage: true,
    });

    const overflow = await page.evaluate(() => ({
      pixels: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      elements: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.right > document.documentElement.clientWidth + 1 ||
            rect.width > document.documentElement.clientWidth + 1
          );
        })
        .slice(0, 8)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className: element.className,
            parentClassName: element.parentElement?.className ?? "",
            text: element.textContent?.trim().slice(0, 80) ?? "",
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        }),
    }));
    const lowContrast = await findLowContrastText(page);
    const smallTargets = auditTouchTargets ? await findSmallTouchTargets(page) : [];
    const dialogFocusFailures = await findDialogFocusFailures(page);

    if (route !== "/login") {
      expect.soft(page.url(), `${route} redirected to login`).not.toMatch(/\/login(?:\?|$)/);
    }
    expect.soft(pageErrors, `${route} emitted browser errors`).toEqual([]);
    expect.soft(failedResponses, `${route} returned server errors`).toEqual([]);
    expect
      .soft(
        overflow.pixels,
        `${route} has horizontal overflow from ${JSON.stringify(overflow.elements)}`,
      )
      .toBeLessThanOrEqual(1);
    expect.soft(lowContrast, `${route} has low-contrast text`).toEqual([]);
    expect.soft(smallTargets, `${route} has touch targets below 44x44`).toEqual([]);
    expect.soft(dialogFocusFailures, `${route} has a dialog focus failure`).toEqual([]);

    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

async function auditCommandDialog(page: import("@playwright/test").Page, profile: string) {
  await page.goto("/app/settings/branding", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Busca global" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Busca global" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({
    path: `test-results/visual-audit/${profile}/app-command-dialog.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function auditOpenDialog(
  page: import("@playwright/test").Page,
  dialog: import("@playwright/test").Locator,
  options: {
    dismissible?: boolean;
    screenshotPath: string;
    trigger?: import("@playwright/test").Locator;
  },
) {
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: options.screenshotPath, fullPage: true });
  await page.keyboard.press("Escape");

  if (options.dismissible === false) {
    await expect(dialog).toBeVisible();
    return;
  }

  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  if (options.trigger) await expect(options.trigger).toBeFocused();
}

async function auditPosOverlays(page: import("@playwright/test").Page) {
  await page.goto("/app/pos", { waitUntil: "domcontentloaded" });
  await page
    .locator(".access-boundary-page")
    .waitFor({ state: "detached" })
    .catch(() => {});
  const productButtons = page.getByTestId("pos-add-item");
  await expect(productButtons.first()).toBeVisible();
  const productCount = await productButtons.count();
  let modifierAudited = false;
  let orderReady = false;

  for (let index = 0; index < productCount && (!modifierAudited || !orderReady); index += 1) {
    const trigger = productButtons.nth(index);
    const itemResponse = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/v1/pos/orders/") &&
          response.url().includes("/items") &&
          response.ok(),
        { timeout: 10_000 },
      )
      .catch(() => null);
    await trigger.click();
    await expect(trigger).toBeEnabled({ timeout: 10_000 });
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    const opened = await dialog
      .waitFor({ state: "visible", timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await auditOpenDialog(page, dialog, {
        screenshotPath: "test-results/visual-audit/focused/pos-modifiers.png",
        trigger,
      });
      modifierAudited = true;
    } else {
      expect(await itemResponse).not.toBeNull();
      await expect(page.getByText(/confirmado na comanda/i)).toBeVisible();
      orderReady = true;
    }
  }

  expect(modifierAudited, "the demo catalog must expose a product with modifiers").toBe(true);
  expect(orderReady, "the demo catalog must allow creating an order without modifiers").toBe(true);

  const productionTrigger = page.getByRole("button", { name: /Enviar para produção/i });
  await expect(productionTrigger).toBeEnabled();
  await productionTrigger.click();
  await auditOpenDialog(page, page.getByRole("dialog", { name: "Conferir envio" }), {
    screenshotPath: "test-results/visual-audit/focused/pos-production-preview.png",
    trigger: productionTrigger,
  });

  const paymentTrigger = page.getByRole("button", { name: "Receber" });
  await expect(paymentTrigger).toBeEnabled();
  await paymentTrigger.click();
  await auditOpenDialog(page, page.getByRole("dialog", { name: /Recebimento/ }), {
    screenshotPath: "test-results/visual-audit/focused/pos-payment.png",
    trigger: paymentTrigger,
  });

  await page.getByRole("button", { name: "Desconto" }).click();
  const totalText = await page.locator(".pos-ticket-summary strong").first().innerText();
  const totalCents = moneyTextToCents(totalText);
  const discountCents = Math.max(1, Math.floor(totalCents / 2));
  await page.getByLabel("Valor do desconto").fill(formatMoneyInput(discountCents));
  await page.getByLabel("Motivo do desconto").fill("Auditoria visual da aprovação gerencial");
  await page.getByRole("button", { name: "Solicitar" }).click();
  await expect(page.getByText(/Desconto enviado para aprovação gerencial/i)).toBeVisible();
}

async function auditApprovalPin(page: import("@playwright/test").Page) {
  await page.goto("/app/settings/operation", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Aprovar" }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await auditOpenDialog(page, page.getByRole("dialog", { name: "Aprovar solicitação" }), {
    screenshotPath: "test-results/visual-audit/focused/approval-pin.png",
    trigger,
  });
}

async function auditDeliveryCancel(page: import("@playwright/test").Page) {
  await page.goto("/app/delivery", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Cancelar", exact: true }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await auditOpenDialog(page, page.getByRole("dialog", { name: "Cancelar entrega" }), {
    screenshotPath: "test-results/visual-audit/focused/delivery-cancel.png",
    trigger,
  });
}

async function auditQrDialogs(page: import("@playwright/test").Page) {
  await page.goto("/q/M03", { waitUntil: "domcontentloaded" });
  const ageDialog = page.getByRole("dialog", { name: "Você tem 18 anos ou mais?" });
  await auditOpenDialog(page, ageDialog, {
    dismissible: false,
    screenshotPath: "test-results/visual-audit/focused/qr-age-gate.png",
  });
  await page.getByRole("button", { name: "Tenho 18 anos ou mais" }).click();
  await expect(ageDialog).toBeHidden();

  const menuRows = page.locator(".qr-menu-row");
  await expect(menuRows.first()).toBeVisible();
  const rowCount = await menuRows.count();
  let modifierAudited = false;
  for (let index = 0; index < rowCount && !modifierAudited; index += 1) {
    const trigger = menuRows.nth(index);
    await trigger.click();
    const dialog = page.locator(".qr-modifier-dialog");
    if (await dialog.isVisible().catch(() => false)) {
      await auditOpenDialog(page, dialog, {
        screenshotPath: "test-results/visual-audit/focused/qr-modifiers.png",
        trigger,
      });
      modifierAudited = true;
    }
  }
  expect(modifierAudited, "the demo QR menu must expose a product with modifiers").toBe(true);
}

function moneyTextToCents(value: string) {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replaceAll(".", "")
    .replace(",", ".");
  return Math.round(Number(normalized) * 100);
}

function formatMoneyInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

async function findDialogFocusFailures(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
      .filter((dialog) => dialog.getClientRects().length > 0)
      .flatMap((dialog) =>
        dialog.contains(document.activeElement)
          ? []
          : [
              {
                label: dialog.getAttribute("aria-label") ?? dialog.getAttribute("aria-labelledby"),
                activeTag: document.activeElement?.tagName.toLowerCase() ?? "none",
              },
            ],
      ),
  );
}

async function findSmallTouchTargets(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'button, input:not([type="hidden"]), select, textarea, summary, [role="button"]',
      ),
    ]
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          !element.classList.contains("visually-hidden") &&
          !element.matches(":disabled, [aria-disabled='true']") &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.getClientRects().length > 0
        );
      })
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width + 0.5 >= 44 && rect.height + 0.5 >= 44
          ? []
          : [
              {
                className: element.className,
                height: Math.round(rect.height * 10) / 10,
                tag: element.tagName.toLowerCase(),
                width: Math.round(rect.width * 10) / 10,
              },
            ];
      })
      .slice(0, 12),
  );
}

async function visualSourceHash() {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) =>
      ["apps/web/", "packages/ui/", "tests/e2e/"].some((prefix) => file.startsWith(prefix)),
    )
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}

async function findLowContrastText(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    type Rgb = { r: number; g: number; b: number; a: number };

    const parseRgb = (value: string): Rgb | null => {
      const match = value.match(
        /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/,
      );
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4]),
      };
    };
    const luminance = ({ r, g, b }: Rgb) => {
      const channels = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (
        0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
      );
    };
    const ratio = (foreground: Rgb, background: Rgb) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    return [...document.querySelectorAll<HTMLElement>("body *")]
      .flatMap((element) => {
        if (element.closest(":disabled, [aria-disabled='true']")) return [];
        const directText = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (!directText) return [];

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.visibility === "hidden" ||
          style.display === "none" ||
          Number(style.opacity) < 0.85 ||
          rect.width < 2 ||
          rect.height < 2 ||
          rect.bottom < 0 ||
          rect.top > innerHeight * 8
        ) {
          return [];
        }

        const foreground = parseRgb(style.color);
        if (!foreground) return [];

        let current: HTMLElement | null = element;
        let background: Rgb | null = null;
        let backgroundElement: HTMLElement | null = null;
        while (current) {
          const currentStyle = getComputedStyle(current);
          if (currentStyle.backgroundImage !== "none") return [];
          const candidate = parseRgb(currentStyle.backgroundColor);
          if (candidate && candidate.a >= 0.95) {
            background = candidate;
            backgroundElement = current;
            break;
          }
          current = current.parentElement;
        }
        if (!background) return [];

        const contrast = ratio(foreground, background);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const minimum = isLarge ? 3 : 4.5;
        if (contrast >= minimum) return [];

        return [
          {
            background: styleValue(background),
            backgroundClass: backgroundElement?.className ?? "",
            color: styleValue(foreground),
            contrast: Number(contrast.toFixed(2)),
            elementClass: element.className,
            tag: element.tagName.toLowerCase(),
            text: directText.slice(0, 80),
          },
        ];
      })
      .slice(0, 8);

    function styleValue(value: Rgb) {
      return `rgb(${value.r}, ${value.g}, ${value.b})`;
    }
  });
}
