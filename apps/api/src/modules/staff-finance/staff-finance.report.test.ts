import { describe, expect, it } from "vitest";
import { renderFinancialCsv, renderFinancialThermal } from "./staff-finance.service";

describe("staff finance canonical report renderers", () => {
  const report = {
    generatedAt: "2026-08-04T00:00:00.000Z",
    settlements: [
      {
        ownerType: "waiter" as const,
        ownerId: "garcom-1",
        status: "closed",
        grossSalesCents: 1_101,
        cancelledCents: 25,
        discountCents: 75,
        netConsumptionCents: 1_001,
        serviceSuggestedCents: 100,
        serviceReceivedCents: 100,
        pendingCashCents: 0,
        occurrenceOpenCents: 30,
        occurrenceRecoveredCents: 20,
        commissionAccruedCents: 90,
        unassigned: false,
      },
      {
        ownerType: "managerial" as const,
        ownerId: "unassigned",
        status: "closed",
        grossSalesCents: 220,
        cancelledCents: 0,
        discountCents: 20,
        netConsumptionCents: 200,
        serviceSuggestedCents: 20,
        serviceReceivedCents: 20,
        pendingCashCents: 0,
        occurrenceOpenCents: 0,
        occurrenceRecoveredCents: 30,
        commissionAccruedCents: 0,
        unassigned: true,
      },
    ],
    totals: {
      grossSalesCents: 1_321,
      cancelledCents: 25,
      discountCents: 95,
      netConsumptionCents: 1_201,
      serviceSuggestedCents: 120,
      serviceReceivedCents: 120,
      pendingCashCents: 0,
      unassignedGrossCents: 220,
      unassignedNetCents: 200,
      openLossCents: 30,
      recoveredCents: 50,
      approvedCommissionCents: 90,
      informedCommissionPaidCents: 40,
    },
    projectionHash: "a".repeat(64),
  };

  it("keeps waiter and unassigned cents in CSV", () => {
    const csv = renderFinancialCsv(report);
    expect(csv).toContain("waiter;garcom-1;closed;1101;25;75;1001;100;100;0;30;20;90;nao");
    expect(csv).toContain("managerial;unassigned;closed;220;0;20;200;20;20;0;0;30;0;sim");
    expect(csv).toContain("TOTAL;netConsumptionCents;Consumo líquido;1201");
    expect(csv).toContain("TOTAL;informedCommissionPaidCents;Partnership informado como pago;40");
    expect(csv).toContain(`HASH;${"a".repeat(64)}`);
  });

  it("prints the same canonical totals for a thermal printer", () => {
    const thermal = renderFinancialThermal(report);
    expect(thermal).toContain("CONSUMO LÍQUIDO R$ 12,01");
    expect(thermal).toContain("SERVIÇO RECEBIDO R$ 1,20");
    expect(thermal).toContain("LÍQUIDO NÃO ATRIBUÍDO R$ 2,00");
    expect(thermal).toContain("PARTNERSHIP INFORMADO COMO PAGO R$ 0,40");
    expect(thermal).toContain("OCORRÊNCIAS EM ANÁLISE R$ 0,30");
    expect(thermal).toContain(`HASH ${"a".repeat(64)}`);
  });
});
