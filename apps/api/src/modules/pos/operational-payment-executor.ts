import { BadRequestException } from "@nestjs/common";

export type OperationalPaymentIntent = {
  id: string;
  executionMode: "manual" | "smartpos" | "tef";
  environment: "development" | "test" | "production";
  amountCents: number;
};
export type OperationalPaymentResult = {
  status: "confirmed" | "failed" | "unknown" | "canceled" | "not_configured";
  providerReference?: string;
};

export interface OperationalPaymentExecutor {
  initiate(intent: OperationalPaymentIntent): Promise<OperationalPaymentResult>;
  query(intent: OperationalPaymentIntent): Promise<OperationalPaymentResult>;
  cancel(intent: OperationalPaymentIntent): Promise<OperationalPaymentResult>;
  refund(intent: OperationalPaymentIntent): Promise<OperationalPaymentResult>;
}

export class ManualPaymentExecutor implements OperationalPaymentExecutor {
  async initiate(): Promise<OperationalPaymentResult> {
    return { status: "confirmed" };
  }
  async query(): Promise<OperationalPaymentResult> {
    return { status: "confirmed" };
  }
  async cancel(): Promise<OperationalPaymentResult> {
    return { status: "canceled" };
  }
  async refund(): Promise<OperationalPaymentResult> {
    return { status: "confirmed" };
  }
}

export class LocalPaymentSimulator implements OperationalPaymentExecutor {
  async initiate(intent: OperationalPaymentIntent): Promise<OperationalPaymentResult> {
    if (intent.environment === "production")
      throw new BadRequestException("Local payment simulator is disabled in production");
    return { status: "unknown", providerReference: `sim-${intent.id}` };
  }
  async query(intent: OperationalPaymentIntent): Promise<OperationalPaymentResult> {
    if (intent.environment === "production")
      throw new BadRequestException("Local payment simulator is disabled in production");
    return { status: "confirmed", providerReference: `sim-${intent.id}` };
  }
  async cancel(intent: OperationalPaymentIntent) {
    if (intent.environment === "production")
      throw new BadRequestException("Local payment simulator is disabled in production");
    return { status: "canceled" as const };
  }
  async refund(intent: OperationalPaymentIntent) {
    if (intent.environment === "production")
      throw new BadRequestException("Local payment simulator is disabled in production");
    return { status: "confirmed" as const };
  }
}

export function operationalPaymentExecutor(
  mode: OperationalPaymentIntent["executionMode"],
  simulator = false,
): OperationalPaymentExecutor {
  if (mode === "manual") return new ManualPaymentExecutor();
  if (simulator) return new LocalPaymentSimulator();
  return {
    initiate: async () => ({ status: "not_configured" }),
    query: async () => ({ status: "not_configured" }),
    cancel: async () => ({ status: "not_configured" }),
    refund: async () => ({ status: "not_configured" }),
  };
}
