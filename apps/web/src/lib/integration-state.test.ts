import { describe, expect, it } from "vitest";
import { availableIntegrationLifecycleActions, integrationStateDetails } from "./integration-state";

describe("integrationStateDetails", () => {
  it("normalizes legacy disabled states to not configured", () => {
    expect(integrationStateDetails("disabled")).toMatchObject({
      state: "not_configured",
      label: "Não configurada",
    });
  });

  it("exposes only valid lifecycle actions for each rendered state", () => {
    expect(availableIntegrationLifecycleActions("homologation")).toEqual(["activate", "revoke"]);
    expect(availableIntegrationLifecycleActions("active")).toEqual(["health", "revoke"]);
    expect(availableIntegrationLifecycleActions("degraded")).toEqual(["health", "revoke"]);
    expect(availableIntegrationLifecycleActions("revoked")).toEqual([]);
  });
});
