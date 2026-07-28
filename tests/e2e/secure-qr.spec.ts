import { expect, request, test } from "@playwright/test";
import {
  apiUrl,
  authenticateBrowserPage,
  authenticatedApiContext,
  skipWhenApiUnavailable,
} from "./helpers";

test.describe("QR seguro por mesa", () => {
  test("abre a gestão de materiais QR sem overflow", async ({ page }) => {
    await skipWhenApiUnavailable();
    await authenticateBrowserPage(page);

    await page.goto("/app/qr", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /QR personalizado por mesa/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("bar-aurora-demo");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("rotaciona o token, invalida o material anterior e gera arte em lote", async () => {
    await skipWhenApiUnavailable();
    const { api } = await authenticatedApiContext();
    const publicApi = await request.newContext({ baseURL: apiUrl });

    const tablesResponse = await api.get("/api/v1/qr/tables");
    expect(tablesResponse.ok()).toBe(true);
    const tables = (await tablesResponse.json()).data as Array<{
      id: string;
      publicUrl: string;
      qrTokenVersion: number;
    }>;
    expect(tables.length).toBeGreaterThan(0);

    const table = tables[0];
    const oldToken = new URL(table.publicUrl).pathname.split("/q/")[1];
    expect((await publicApi.get(`/api/v1/qr/public/${oldToken}/context`)).ok()).toBe(true);

    const rotation = await api.post(`/api/v1/qr/tables/${table.id}/rotate`);
    expect(rotation.ok()).toBe(true);
    const rotated = (await rotation.json()) as {
      tableId: string;
      version: number;
      publicUrl: string;
    };
    expect(rotated.version).toBe(table.qrTokenVersion + 1);

    const newToken = new URL(rotated.publicUrl).pathname.split("/q/")[1];
    expect((await publicApi.get(`/api/v1/qr/public/${oldToken}/context`)).ok()).toBe(false);
    expect((await publicApi.get(`/api/v1/qr/public/${newToken}/context`)).ok()).toBe(true);

    const artwork = await api.post("/api/v1/qr/artwork", {
      data: {
        tableIds: [table.id],
        format: "svg",
        size: "plate_10x15",
      },
    });
    expect(artwork.ok()).toBe(true);
    const artworkPayload = (await artwork.json()) as {
      items: Array<{ tableId: string; svg: string; publicUrl: string }>;
    };
    expect(artworkPayload.items).toHaveLength(1);
    expect(artworkPayload.items[0]?.tableId).toBe(table.id);
    expect(artworkPayload.items[0]?.svg).toContain("<svg");

    await publicApi.dispose();
    await api.dispose();
  });
});
