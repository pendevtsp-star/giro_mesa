import {
  resolveValidatedAddresses,
  type SafeHttpAddress,
  type SafeHttpResolver,
  UnsafeOutboundUrlError,
  validateOutboundUrl,
} from "@giromesa/config";
import { BadRequestException } from "@nestjs/common";

type ResolveHost = (hostname: string) => Promise<string[]>;

export async function assertSafeOutboundUrl(value: string, resolveHost?: ResolveHost) {
  try {
    const url = validateOutboundUrl(value);
    await resolveValidatedAddresses(url, resolveHost ? adaptResolver(resolveHost) : undefined);
    return url;
  } catch (error) {
    if (error instanceof UnsafeOutboundUrlError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export async function assertSafeRedirect(
  currentUrl: string,
  location: string,
  resolveHost?: ResolveHost,
) {
  return assertSafeOutboundUrl(new URL(location, currentUrl).toString(), resolveHost);
}

function adaptResolver(resolveHost: ResolveHost): SafeHttpResolver {
  return async (hostname) =>
    (await resolveHost(hostname)).map(
      (address): SafeHttpAddress => ({
        address,
        family: address.includes(":") ? 6 : 4,
      }),
    );
}
