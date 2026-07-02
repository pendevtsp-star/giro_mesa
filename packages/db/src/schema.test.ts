import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  auditLogs,
  branches,
  cashSessions,
  categories,
  customers,
  deliveryOrders,
  diningTables,
  fiscalDocuments,
  floorPlans,
  integrationAccounts,
  inventoryItems,
  invitations,
  kdsStations,
  kdsTickets,
  modifierGroups,
  modifierOptions,
  orderItems,
  orders,
  outboxEvents,
  payments,
  products,
  recipeItems,
  recipes,
  roles,
  sessions,
  stockLocations,
  stockMovements,
  subscriptions,
  tabs,
  userRoles,
  users,
  webhookEvents,
} from "./schema";

const tenantScopedTables = {
  auditLogs,
  branches,
  cashSessions,
  categories,
  customers,
  deliveryOrders,
  diningTables,
  fiscalDocuments,
  floorPlans,
  integrationAccounts,
  inventoryItems,
  invitations,
  kdsStations,
  kdsTickets,
  modifierGroups,
  modifierOptions,
  orderItems,
  orders,
  outboxEvents,
  payments,
  products,
  recipeItems,
  recipes,
  roles,
  sessions,
  stockLocations,
  stockMovements,
  subscriptions,
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
});
