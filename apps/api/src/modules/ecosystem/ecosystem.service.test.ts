import { afterEach, describe, expect, it } from "vitest";
import { isAllowedEcosystemCampaignTarget } from "./ecosystem.service";

describe("ecosystem boundaries", () => {
  const previousDoseClubUrl = process.env.DOSECLUB_PUBLIC_URL;
  const previousAppUrl = process.env.PUBLIC_APP_URL;

  afterEach(() => {
    process.env.DOSECLUB_PUBLIC_URL = previousDoseClubUrl;
    process.env.PUBLIC_APP_URL = previousAppUrl;
  });

  it("allows campaigns only on official product origins", () => {
    process.env.DOSECLUB_PUBLIC_URL = "https://doseclube.giromesa.com.br";
    process.env.PUBLIC_APP_URL = "https://giromesa.com.br";
    expect(
      isAllowedEcosystemCampaignTarget(
        "doseclub",
        "https://doseclube.giromesa.com.br/planos?from=giromesa",
      ),
    ).toBe(true);
    expect(isAllowedEcosystemCampaignTarget("doseclub", "https://evil.example/phishing")).toBe(
      false,
    );
    expect(isAllowedEcosystemCampaignTarget("giromesa", "https://giromesa.com.br/planos")).toBe(
      true,
    );
  });
});
