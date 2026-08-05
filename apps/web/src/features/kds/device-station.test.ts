import { describe, expect, it } from "vitest";
import type { OperationalDeviceProfile } from "../../lib/giromesa-api";
import { resolveKdsStationScope } from "./device-station";

const device = {
  id: "device-a",
  branchId: "branch-a",
  name: "KDS cozinha",
  kind: "kds",
  initialMode: "kds",
  stationId: "station-kitchen",
  printerDeviceId: "printer-a",
  allowModeSwitch: false,
  theme: "dark",
  kdsInput: "touch",
} satisfies OperationalDeviceProfile;

describe("KDS device station scope", () => {
  it("locks a bound terminal to its configured station", () => {
    expect(resolveKdsStationScope(device, "all")).toEqual({
      stationId: "station-kitchen",
      locked: true,
    });
  });

  it("does not allow a query to override the bound station", () => {
    expect(resolveKdsStationScope(device, "station-bar").stationId).toBe("station-kitchen");
  });

  it("keeps the requested filter for an unbound terminal", () => {
    expect(resolveKdsStationScope(null, "station-bar")).toEqual({
      stationId: "station-bar",
      locked: false,
    });
  });

  it("uses a bound station as the default but permits switching when configured", () => {
    const switchable = { ...device, allowModeSwitch: true };
    expect(resolveKdsStationScope(switchable, "").stationId).toBe("station-kitchen");
    expect(resolveKdsStationScope(switchable, "station-bar").stationId).toBe("station-bar");
    expect(resolveKdsStationScope(switchable, "all").stationId).toBe("all");
  });
});
