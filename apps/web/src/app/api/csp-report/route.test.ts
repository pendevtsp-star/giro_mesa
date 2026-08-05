import { describe, expect, it, vi } from "vitest";
import { normalizeCspReport } from "../../../lib/csp-report";
import { POST } from "./route";

describe("CSP report collector", () => {
  it("keeps origins but removes paths and query strings", () => {
    expect(
      normalizeCspReport({
        "csp-report": {
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://cdn.example.test/private?id=secret",
        },
      }),
    ).toEqual({
      directive: "script-src-elem",
      blockedOrigin: "https://cdn.example.test",
      documentOrigin: "unknown",
    });
  });

  it("accepts a report without echoing the payload", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await POST(
      new Request("http://localhost/api/csp-report", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
