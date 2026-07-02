import { branches, plans, roles, tenants, userRoles, users } from "@giromesa/db";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { hashPassword } from "../../common/password";
import { DatabaseService } from "../database/database.service";

type CreateTenantInput = {
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  document?: string | undefined;
  planCode?: string | undefined;
};

@Injectable()
export class TenantsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createTenant(input: CreateTenantInput) {
    const slug = input.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const planCode = input.planCode ?? "starter";
    const passwordHash = await hashPassword(input.ownerPassword);

    return this.database.db.transaction(async (tx) => {
      const [existingPlan] = await tx.select().from(plans).where(eq(plans.code, planCode)).limit(1);
      const [plan] = existingPlan
        ? [existingPlan]
        : await tx
            .insert(plans)
            .values({
              code: planCode,
              name: planCode === "starter" ? "Starter" : planCode,
              priceCents: planCode === "starter" ? 14900 : 0,
              limits: {
                branches: 1,
                users: 5,
                products: 150,
              },
            })
            .returning();

      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.name,
          slug,
          document: input.document,
          status: "trial",
        })
        .returning();

      if (!tenant || !plan) {
        throw new Error("Failed to create tenant");
      }

      const [branch] = await tx
        .insert(branches)
        .values({
          tenantId: tenant.id,
          name: "Matriz",
          document: input.document,
        })
        .returning();

      const [ownerRole] = await tx
        .insert(roles)
        .values({
          tenantId: tenant.id,
          code: "owner",
          name: "Proprietario",
          permissions: [
            "tenant:manage",
            "catalog:manage",
            "pos:operate",
            "kds:operate",
            "cash:manage",
            "inventory:manage",
            "reports:read",
          ],
        })
        .returning();

      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: input.ownerEmail.toLowerCase(),
          name: input.ownerName,
          passwordHash,
        })
        .returning();

      if (!branch || !ownerRole || !owner) {
        throw new Error("Failed to create owner account");
      }

      await tx.insert(userRoles).values({
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRole.id,
        branchId: branch.id,
      });

      return {
        tenant,
        branch,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
        },
        subscription: {
          planCode: plan.code,
          status: "trial",
          nextStep: "create_asaas_checkout_when_enabled",
        },
      };
    });
  }
}
