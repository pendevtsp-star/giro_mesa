import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  approvalRequests,
  auditLogs,
  branchBusinessHourExceptions,
  branchBusinessHours,
  branches,
  branchOperationalSettings,
  cashMovements,
  cashSessions,
  categories,
  customers,
  deliveryOrders,
  diningTables,
  ecosystemCampaigns,
  federationHandoffs,
  fiscalDocuments,
  fiscalSettings,
  floorAreas,
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
  operationalDevices,
  operationalEvents,
  operationalPins,
  operationalShifts,
  operationIdempotency,
  operationPolicies,
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
  reservations,
  reservationTables,
  roles,
  sessions,
  stockLocations,
  stockMovements,
  subscriptions,
  suppliers,
  tableEvents,
  tabs,
  tenantEntitlements,
  userOperationalPreferences,
  userRoles,
  users,
  waitlistEntries,
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
  ecosystemCampaigns,
  federationHandoffs,
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
  operationPolicies,
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
  tenantEntitlements,
  userRoles,
  users,
  webhookEvents,
  approvalRequests,
  floorAreas,
  reservations,
  waitlistEntries,
  tableEvents,
  branchBusinessHourExceptions,
  branchBusinessHours,
  branchOperationalSettings,
  operationalDevices,
  operationalEvents,
  operationalPins,
  operationIdempotency,
  reservationTables,
  userOperationalPreferences,
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

  it("tracks payment origin and cash handover lifecycle", () => {
    const columns = Object.keys(getTableColumns(payments));

    expect(columns).toContain("registeredByUserId");
    expect(columns).toContain("registeredVia");
    expect(columns).toContain("cashHandoverStatus");
    expect(columns).toContain("cashHandoverReceivedByUserId");
    expect(columns).toContain("cashHandoverReceivedAt");
  });

  it("stores hybrid operation policy, approval and floor contracts", () => {
    expect(Object.keys(getTableColumns(operationPolicies))).toEqual(
      expect.arrayContaining(["tenantId", "branchId", "roleId", "maxDiscountWithoutApprovalBps"]),
    );
    expect(Object.keys(getTableColumns(approvalRequests))).toEqual(
      expect.arrayContaining(["tenantId", "branchId", "requestedByUserId", "status", "action"]),
    );
    expect(Object.keys(getTableColumns(reservations))).toEqual(
      expect.arrayContaining(["tenantId", "branchId", "tableId", "status", "partySize"]),
    );
    expect(Object.keys(getTableColumns(waitlistEntries))).toEqual(
      expect.arrayContaining(["tenantId", "branchId", "status", "partySize"]),
    );
    expect(Object.keys(getTableColumns(tableEvents))).toEqual(
      expect.arrayContaining(["tenantId", "branchId", "tableId", "type"]),
    );
    expect(Object.keys(getTableColumns(reservationTables))).toEqual(
      expect.arrayContaining(["tenantId", "branchId", "reservationId", "tableId"]),
    );
  });

  it("stores the operational redesign foundation without plaintext device credentials", () => {
    expect(Object.keys(getTableColumns(branchOperationalSettings))).toEqual(
      expect.arrayContaining(["cleaningMode", "allowWaiterPayments", "defaultTheme"]),
    );
    expect(Object.keys(getTableColumns(operationalDevices))).toContain("tokenHash");
    expect(Object.keys(getTableColumns(operationalDevices))).not.toContain("token");
    expect(Object.keys(getTableColumns(operationalPins))).toContain("pinHash");
    expect(Object.keys(getTableColumns(operationalPins))).not.toContain("pin");
    expect(Object.keys(getTableColumns(operationalEvents))).toContain("version");
    expect(Object.keys(getTableColumns(orderItems))).toContain("sourceChannel");
    expect(Object.keys(getTableColumns(cashSessions))).toEqual(
      expect.arrayContaining(["version", "closeIdempotencyKey"]),
    );
  });
});
