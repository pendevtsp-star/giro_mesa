import type {
  CleaningMode,
  KdsInputMode,
  OrderStatus,
  ProductionOutputMode,
  ThemeMode,
} from "./enums";

export const activeOrderStatuses = [
  "draft",
  "opened",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "served",
  "waiting_payment",
  "partially_paid",
] as const satisfies readonly OrderStatus[];

export type BranchOperationalSettings = {
  branchId: string;
  cleaningMode: CleaningMode;
  allowWaiterPayments: boolean;
  defaultTheme: ThemeMode;
  defaultKdsInputMode: KdsInputMode;
};

export type BusinessHourInterval = {
  opensAt: string;
  closesAt: string;
};

export type WeeklyBusinessHour = BusinessHourInterval & {
  weekday: number;
  sortOrder: number;
};

export type BusinessHourException = {
  date: string;
  isClosed: boolean;
  intervals: BusinessHourInterval[];
  reason?: string | null | undefined;
};

export type ProductionRoutingItem = {
  id: string;
  name: string;
  categoryId: string | null;
};

export type ProductionRoutingStation = {
  id: string;
  name: string;
  outputMode: ProductionOutputMode;
  productCategoryIds: string[];
};

export type ProductionRoutingPrintRoute = {
  id: string;
  stationId: string | null;
  printerDeviceId: string;
  printerName: string;
};

export type ProductionRoutingPreview = {
  orderId: string;
  destinations: Array<{
    stationId: string;
    stationName: string;
    outputMode: ProductionOutputMode;
    itemIds: string[];
    printers: Array<{ routeId: string; deviceId: string; name: string }>;
  }>;
  unroutedItems: ProductionRoutingItem[];
};

export type OperationalEventEnvelope = {
  version: number;
  type: string;
  aggregateType: string;
  aggregateId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type OperationalSession = {
  branchId: string;
  shift: unknown | null;
  cash: unknown | null;
  order: unknown | null;
  settings: BranchOperationalSettings;
  latestEventVersion: number;
};

export function resolveProductionRouting(input: {
  orderId: string;
  items: ProductionRoutingItem[];
  stations: ProductionRoutingStation[];
  printRoutes: ProductionRoutingPrintRoute[];
}): ProductionRoutingPreview {
  const routedItemIds = new Set<string>();
  const destinations = input.stations.flatMap((station) => {
    const items = input.items.filter(
      (item) =>
        station.productCategoryIds.length === 0 ||
        (item.categoryId !== null && station.productCategoryIds.includes(item.categoryId)),
    );
    if (items.length === 0) return [];
    for (const item of items) routedItemIds.add(item.id);
    return [
      {
        stationId: station.id,
        stationName: station.name,
        outputMode: station.outputMode,
        itemIds: items.map((item) => item.id),
        printers: input.printRoutes
          .filter((route) => route.stationId === station.id)
          .map((route) => ({
            routeId: route.id,
            deviceId: route.printerDeviceId,
            name: route.printerName,
          })),
      },
    ];
  });

  return {
    orderId: input.orderId,
    destinations,
    unroutedItems: input.items.filter((item) => !routedItemIds.has(item.id)),
  };
}
