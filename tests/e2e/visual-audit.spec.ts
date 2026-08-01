import { expect, test } from "@playwright/test";
import {
  authenticateBrowserPage,
  authenticatePlatformPage,
  skipWhenApiUnavailable,
} from "./helpers";

const enabled = process.env.VISUAL_AUDIT === "1";

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
  "/app/onboarding",
  "/app/printing",
  "/app/fiscal",
  "/app/outbox",
  "/app/audit",
  "/app/security",
  "/app/billing",
  "/app/settings/branding",
  "/app/settings/operation",
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
] as const;

const platformRoutes = ["/platform", "/platform/support"] as const;

const viewports = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "tablet-landscape", width: 1024, height: 768 },
  { label: "tablet-portrait", width: 768, height: 1024 },
  { label: "mobile", width: 390, height: 844 },
] as const;

test.describe("Visual route audit", () => {
  test.skip(!enabled, "Set VISUAL_AUDIT=1 to capture the complete route matrix.");
  test.describe.configure({ timeout: 180_000 });

  for (const viewport of viewports) {
    test(`audits authenticated routes at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await skipWhenApiUnavailable();
      await page.setViewportSize(viewport);
      await authenticateBrowserPage(page);

      await auditRoutes(page, adminRoutes, viewport.label);
    });
  }

  for (const viewport of viewports) {
    test(`audits public routes at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await auditRoutes(page, publicRoutes, viewport.label);
    });
  }

  for (const viewport of [viewports[0], viewports[3]]) {
    test(`audits platform routes at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await skipWhenApiUnavailable();
      await page.setViewportSize(viewport);
      await authenticatePlatformPage(page);

      await auditRoutes(page, platformRoutes, viewport.label);
    });
  }
});

async function auditRoutes(
  page: import("@playwright/test").Page,
  routes: readonly string[],
  viewportLabel: string,
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
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
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
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        }),
    }));
    const lowContrast = await findLowContrastText(page);

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

    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
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
