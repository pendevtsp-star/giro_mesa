import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { parseCanonicalCsv } from "./payment-reconciliation.service";

describe("parseCanonicalCsv", () => {
  it("normalizes settlements and chargebacks without rounding currency", () => {
    const rows = parseCanonicalCsv(
      [
        "external_key,gross_cents,fee_cents,net_cents,provider_reference,nsu,authorization_code,settled_at,kind",
        "sale-1,12590,390,12200,provider-1,123,ABC,2026-08-05T12:00:00.000Z,settlement",
        "cb-1,5000,0,5000,provider-2,456,DEF,2026-08-06T12:00:00.000Z,chargeback",
      ].join("\n"),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      externalKey: "sale-1",
      grossCents: 12590,
      feeCents: 390,
      netCents: 12200,
      kind: "settlement",
    });
    expect(rows[1]).toMatchObject({ externalKey: "cb-1", kind: "chargeback" });
  });

  it("rejects duplicate external keys in the same immutable import", () => {
    expect(() =>
      parseCanonicalCsv(
        [
          "external_key,gross_cents,fee_cents,net_cents",
          "same,1000,10,990",
          "same,1000,10,990",
        ].join("\n"),
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects malformed or impossible cent values", () => {
    expect(() =>
      parseCanonicalCsv(
        ["external_key,gross_cents,fee_cents,net_cents", "bad,10.5,-1,20"].join("\n"),
      ),
    ).toThrow("Invalid monetary value on row 2");
  });
});
