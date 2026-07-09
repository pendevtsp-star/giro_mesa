import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const webUrl = process.env.WEB_URL ?? "http://127.0.0.1:3002";
const outputDir = resolve("test-results/visual-review-fallback");

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: webUrl,
  viewport: { width: 1440, height: 1000 },
});

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => {
  consoleErrors.push(error.message);
});

const pages = [
  ["table-qr", "/q/M03"],
  ["platform", "/platform"],
  ["platform-support", "/platform/support"],
  ["platform-tenant", "/platform/demo"],
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

await browser.close();

console.log(JSON.stringify({ outputDir, results, consoleErrors }, null, 2));
