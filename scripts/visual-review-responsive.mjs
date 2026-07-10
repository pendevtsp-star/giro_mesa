import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, request } from "@playwright/test";

const webUrl = process.env.WEB_URL ?? "http://127.0.0.1";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1";
const outputDir = resolve("test-results/visual-review-responsive");

const viewports = [
  ["desktop", { width: 1440, height: 1000 }],
  ["tablet", { width: 834, height: 1112 }],
  ["mobile", { width: 390, height: 844 }],
];

const surfaces = [
  ["public", "landing", "/", null],
  ["public", "login", "/login", null],
  ["admin", "app", "/app", "admin"],
  ["admin", "waiter", "/app/waiter", "admin"],
  ["admin", "reports", "/app/reports", "admin"],
  ["admin", "branding", "/app/settings/branding", "admin"],
  ["admin", "qr", "/q/M03", "admin"],
  ["platform", "platform", "/platform", "platform"],
  ["platform", "support", "/platform/support", "platform"],
];

await mkdir(outputDir, { recursive: true });

const api = await request.newContext({ baseURL: apiUrl });
const sessions = {
  admin: await login("admin@bar-aurora-demo.local", "Demo@12345"),
  platform: await login("owner@giromesa.local", "Platform@12345"),
};

const browser = await chromium.launch();
const results = [];
const consoleErrors = [];
const failedRequests = [];

for (const [viewportName, viewport] of viewports) {
  for (const [, name, path, sessionKey] of surfaces) {
    const context = await browser.newContext({ baseURL: webUrl, viewport });
    if (sessionKey) {
      await context.addCookies(cookieTargets(sessions[sessionKey]));
    }

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push({ viewport: viewportName, page: name, message: message.text() });
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push({ viewport: viewportName, page: name, message: error.message });
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedRequests.push({
          viewport: viewportName,
          page: name,
          status: response.status(),
          url: response.url(),
        });
      }
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const file = resolve(outputDir, `${name}-${viewportName}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({
      name,
      viewport: viewportName,
      path,
      url: page.url(),
      screenshot: file,
      heading: await page
        .locator("h1")
        .first()
        .textContent()
        .catch(() => null),
    });
    await context.close();
  }
}

await browser.close();
await api.dispose();

console.log(JSON.stringify({ outputDir, results, consoleErrors, failedRequests }, null, 2));

async function login(email, password) {
  const response = await api.post("/api/v1/auth/login", {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`Login failed for ${email}: ${response.status()}`);
  }

  const token = response.headers()["set-cookie"]?.match(/gm_session=([^;]+)/)?.[1];
  if (!token) {
    throw new Error(`Login did not return gm_session for ${email}`);
  }
  return token;
}

function cookieTargets(token) {
  return Array.from(new Set([new URL(webUrl).origin, new URL(apiUrl).origin])).map((url) => ({
    name: "gm_session",
    value: token,
    url,
    httpOnly: true,
    sameSite: "Lax",
  }));
}
