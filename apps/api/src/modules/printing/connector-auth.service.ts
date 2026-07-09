import { integrationAccounts } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { firstHeader, type HeaderRecord, requestIdFromHeaders } from "../../common/http";
import { hashIntegrationApiKey } from "../../common/integration-key";
import { DatabaseService } from "../database/database.service";

const provider = "local_printer_connector";

@Injectable()
export class ConnectorAuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async resolveContext(
    headers: HeaderRecord,
    requiredScope: "print_jobs:read" | "print_jobs:process",
  ): Promise<TenantContext> {
    const token = firstHeader(headers["x-giromesa-connector-key"]);
    if (!token) {
      throw new UnauthorizedException("Missing connector key");
    }

    const [account] = await this.database.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.provider, provider),
          eq(integrationAccounts.status, "active"),
          eq(integrationAccounts.apiKeyHash, hashIntegrationApiKey(token)),
        ),
      )
      .limit(1);

    if (!account) {
      throw new UnauthorizedException("Invalid connector key");
    }

    const scopes = readStringArray(account.config.scopes);
    if (!scopes.includes(requiredScope)) {
      throw new ForbiddenException({ error: "forbidden", requiredScope });
    }

    const branchId = readString(account.config.branchId);
    if (!branchId) {
      throw new ForbiddenException("Connector key must be bound to a branch");
    }

    return {
      tenantId: account.tenantId,
      branchId,
      requestId: requestIdFromHeaders(headers),
      permissions: scopes,
    };
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
