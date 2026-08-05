import { describe, expect, it } from "vitest";
import { operationalEntryLabel } from "./OperationalAttentionPanel";

describe("operational attention presentation", () => {
  it("uses concise Portuguese labels without exposing technical paths", () => {
    expect(operationalEntryLabel("open_order")).toBe("Abrir comanda");
    expect(operationalEntryLabel("register_payment")).toBe("Registrar pagamento");
    expect(operationalEntryLabel("request_waiter_help")).toBe("Solicitar ajuda");
    expect(operationalEntryLabel("unknown_internal_command")).toBe("Operação do atendimento");
  });
});
