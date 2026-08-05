import { BadRequestException } from "@nestjs/common";

export function readClubWhiskyBranchId(config: Record<string, unknown>) {
  const branchId = config.branchId;
  return typeof branchId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)
    ? branchId
    : null;
}

export function activeClubWhiskyAccountAppliesToBranch(
  config: Record<string, unknown>,
  branchId: string,
  tenantOwnedBranchIds: readonly string[],
) {
  const configuredBranchId = readClubWhiskyBranchId(config);
  if (!configuredBranchId || !tenantOwnedBranchIds.includes(configuredBranchId)) {
    throw new BadRequestException(
      "Configure uma filial válida do tenant na integração Dose Club antes de fechar o turno",
    );
  }
  return configuredBranchId === branchId;
}
