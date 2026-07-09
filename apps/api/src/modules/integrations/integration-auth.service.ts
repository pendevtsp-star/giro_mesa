import { integrationAccounts } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { firstHeader, type HeaderRecord, requestIdFromHeaders } from "../../common/http";
import { hashIntegrationApiKey } from "../../common/integration-key";
import { DatabaseService } from "../database/database.service";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

@Injectable()
export class IntegrationAuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async resolveContext(
    headers: HeaderRecord,
    provider: string,
    requiredScope: string,
  ): Promise<TenantContext> {
    const apiKey = firstHeader(headers["x-giromesa-integration-key"]);
    if (!apiKey) {
      throw new UnauthorizedException("Missing integration API key");
    }

    const [account] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.provider, provider),
          eq(integrationAccounts.status, "active"),
          eq(integrationAccounts.apiKeyHash, hashIntegrationApiKey(apiKey)),
        ),
      )
      .limit(1);

    if (!account) {
      throw new UnauthorizedException("Invalid integration API key");
    }

    const scopes = stringArray(account.config.scopes);
    if (!scopes.includes(requiredScope)) {
      throw new ForbiddenException({
        error: "forbidden",
        requiredScope,
      });
    }

    const branchId = optionalString(account.config.branchId);
    const context: TenantContext = {
      tenantId: account.tenantId,
      requestId: requestIdFromHeaders(headers),
      permissions: scopes,
    };

    if (branchId) {
      context.branchId = branchId;
    }

    return context;
  }
}
