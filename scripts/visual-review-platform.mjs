import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, request } from "@playwright/test";

const webUrl = process.env.WEB_URL ?? "http://127.0.0.1:3002";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3333";
const outputDir = resolve("test-results/visual-review-platform");

await mkdir(outputDir, { recursive: true });

const api = await request.newContext({ baseURL: apiUrl });
const login = await api.post("/api/v1/auth/login", {
  data: {
    email: "owner@giromesa.local",
    password: "Demo@12345",
  },
});

if (!login.ok()) {
  throw new Error(`Owner login failed with ${login.status()}`);
}

const sessionToken = login.headers()["set-cookie"]?.match(/gm_session=([^;]+)/)?.[1];
if (!sessionToken) {
  throw new Error("Owner login did not return gm_session cookie");
}

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: webUrl,
  viewport: { width: 1440, height: 1000 },
});

const cookieTargets = Array.from(new Set([new URL(webUrl).origin, new URL(apiUrl).origin]));
await context.addCookies(
  cookieTargets.map((url) => ({
    name: "gm_session",
    value: sessionToken,
    url,
    httpOnly: true,
    sameSite: "Lax",
  })),
);

const page = await context.newPage();
const pages = [
  ["platform", "/platform"],
  ["platform-support", "/platform/support"],
];
const results = [];

for (const [name, path] of pages) {
  await page.goto(path, { waitUntil: "networkidle" });
  const file = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  results.push({
    name,
    path,
    url: page.url(),
    screenshot: file,
    title: await page.title(),
    heading: await page.locator("h1").first().textContent().catch(() => null),
  });
}

const tenantLinks = await page.locator('a[href^="/platform/"]').evaluateAll((elements) =>
  elements
    .map((element) => element.getAttribute("href"))
    .filter((href) => href && href !== "/platform" && href !== "/platform/support"),
);

if (tenantLinks[0]) {
  await page.goto(tenantLinks[0], { waitUntil: "networkidle" });
  const file = resolve(outputDir, "platform-tenant.png");
  await page.screenshot({ path: file, fullPage: true });
  results.push({
    name: "platform-tenant",
    path: tenantLinks[0],
    url: page.url(),
    screenshot: file,
    title: await page.title(),
    heading: await page.locator("h1").first().textContent().catch(() => null),
  });
}

await browser.close();
await api.dispose();

console.log(JSON.stringify({ outputDir, results }, null, 2));
