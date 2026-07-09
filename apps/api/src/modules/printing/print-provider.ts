import type { PrintProvider, ProviderResult } from "@giromesa/domain";
import { renderKitchenTicket } from "./print-renderer";

export class MockPrintProvider implements PrintProvider {
  renderKitchenTicket(
    input: Parameters<PrintProvider["renderKitchenTicket"]>[0],
  ): ProviderResult<{ renderedText: string }> {
    return {
      ok: true,
      externalId: `mock-print-${Date.now()}`,
      data: {
        renderedText: renderKitchenTicket(input),
      },
    };
  }
}

export function createPrintProvider() {
  return new MockPrintProvider();
}
