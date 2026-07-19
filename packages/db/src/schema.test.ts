import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  auditLogs,
  branches,
  cashMovements,
  cashSessions,
  categories,
  customers,
  deliveryOrders,
  diningTables,
  fiscalDocuments,
  fiscalSettings,
  floorPlans,
  integrationAccounts,
  inventoryItems,
  invitations,
  kdsStations,
  kdsTickets,
  modifierGroups,
  modifierOptions,
  oauthAccounts,
  onboardingSteps,
  operationalShifts,
  orderItems,
  orders,
  outboxEvents,
  payments,
  printerDevices,
  printJobs,
  printRoutes,
  products,
  recipeItems,
  recipes,
  roles,
  sessions,
  stockLocations,
  stockMovements,
  subscriptions,
  suppliers,
  tabs,
  userRoles,
  users,
  webhookEvents,
} from "./schema";

const tenantScopedTables = {
  auditLogs,
  branches,
  cashMovements,
  cashSessions,
  categories,
  customers,
  deliveryOrders,
  diningTables,
  fiscalDocuments,
  fiscalSettings,
  floorPlans,
  integrationAccounts,
  inventoryItems,
  invitations,
  kdsStations,
  kdsTickets,
  modifierGroups,
  modifierOptions,
  oauthAccounts,
  onboardingSteps,
  orderItems,
  orders,
  operationalShifts,
  outboxEvents,
  payments,
  printerDevices,
  printJobs,
  printRoutes,
  products,
  recipeItems,
  recipes,
  roles,
  sessions,
  stockLocations,
  stockMovements,
  subscriptions,
  suppliers,
  tabs,
  userRoles,
  users,
  webhookEvents,
};

describe("multi-tenant schema", () => {
  it("keeps business tables tenant scoped", () => {
    for (const [name, table] of Object.entries(tenantScopedTables)) {
      expect(Object.keys(getTableColumns(table)), name).toContain("tenantId");
    }
  });

  it("exposes club eligibility fields on products", () => {
    const columns = Object.keys(getTableColumns(products));

    expect(columns).toContain("isClubEligible");
    expect(columns).toContain("bottleVolumeMl");
    expect(columns).toContain("defaultDoseMl");
    expect(columns).toContain("spiritType");
  });

  it("stores integration API keys as hashes, not plaintext tokens", () => {
    const columns = Object.keys(getTableColumns(integrationAccounts));

    expect(columns).toContain("apiKeyHash");
    expect(columns).toContain("apiKeyLastFour");
    expect(columns).toContain("apiKeyCreatedAt");
    expect(columns).not.toContain("apiKey");
  });

  it("keeps fiscal product and branch configuration fields available", () => {
    const productColumns = Object.keys(getTableColumns(products));
    const settingColumns = Object.keys(getTableColumns(fiscalSettings));
    const documentColumns = Object.keys(getTableColumns(fiscalDocuments));

    expect(productColumns).toContain("fiscalNcm");
    expect(productColumns).toContain("fiscalCfop");
    expect(productColumns).toContain("fiscalCsosn");
    expect(settingColumns).toContain("certificateSecretRef");
    expect(settingColumns).toContain("cscSecretRef");
    expect(documentColumns).toContain("accessKey");
    expect(documentColumns).toContain("danfeUrl");
  });

  it("keeps printing hardware and queue tables tenant scoped", () => {
    const deviceColumns = Object.keys(getTableColumns(printerDevices));
    const routeColumns = Object.keys(getTableColumns(printRoutes));
    const jobColumns = Object.keys(getTableColumns(printJobs));

    expect(deviceColumns).toContain("branchId");
    expect(deviceColumns).toContain("connectionType");
    expect(routeColumns).toContain("printerDeviceId");
    expect(routeColumns).toContain("stationId");
    expect(jobColumns).toContain("idempotencyKey");
    expect(jobColumns).toContain("renderedText");
  });
});
