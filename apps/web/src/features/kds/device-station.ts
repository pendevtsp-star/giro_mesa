import type { OperationalDeviceProfile } from "../../lib/giromesa-api";

export function resolveKdsStationScope(
  device: OperationalDeviceProfile | null,
  requestedStationId: string,
) {
  if (device?.stationId && device.allowModeSwitch === false) {
    return {
      stationId: device.stationId,
      locked: true,
    };
  }
  return { stationId: requestedStationId || device?.stationId || "all", locked: false };
}
