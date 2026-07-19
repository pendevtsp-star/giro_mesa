import {
  auditLogs,
  branches,
  cashSessions,
  categories,
  diningTables,
  onboardingSteps,
  printerDevices,
  products,
  roles,
  users,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

export const onboardingStepDefinitions = [
  {
    key: "business_profile",
    title: "Perfil do negócio",
    description: "Confirme nome, documento e dados comerciais do estabelecimento.",
    href: "/app/settings/branding",
    skippable: false,
  },
  {
    key: "branch_setup",
    title: "Unidade configurada",
    description: "Cadastre a filial que vai operar o primeiro turno.",
    href: "/app/onboarding",
    skippable: false,
  },
  {
    key: "team_roles",
    title: "Equipe e permissões",
    description: "Tenha ao menos um usuário ativo e cargos configurados.",
    href: "/app/team",
    skippable: false,
  },
  {
    key: "tables_setup",
    title: "Mesas e salão",
    description: "Crie mesas e organize o mapa do salão.",
    href: "/app/salon",
    skippable: false,
  },
  {
    key: "catalog_setup",
    title: "Catálogo de venda",
    description: "Cadastre categorias e produtos disponíveis no PDV.",
    href: "/app/catalog",
    skippable: false,
  },
  {
    key: "printer_setup",
    title: "Impressão operacional",
    description: "Configure impressoras ou marque como etapa assistida.",
    href: "/app/printing",
    skippable: true,
  },
  {
    key: "cash_setup",
    title: "Caixa preparado",
    description: "Valide permissões e fluxo de abertura do caixa.",
    href: "/app/cash",
    skippable: false,
  },
  {
    key: "qr_menu_setup",
    title: "Cardápio QR",
    description: "Tenha produtos habilitados para cardápio digital.",
    href: "/m/bar-aurora",
    skippable: true,
  },
  {
    key: "test_order",
    title: "Pedido de teste",
    description: "Execute um pedido completo de mesa, cozinha e pagamento.",
    href: "/app/waiter",
    skippable: true,
  },
  {
    key: "first_shift_ready",
    title: "Pronto para primeiro turno",
    description: "Tudo essencial está pronto para operar com rastreabilidade.",
    href: "/app/cash",
    skippable: false,
  },
] as const;

type StepKey = (typeof onboardingStepDefinitions)[number]["key"];
type StepStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

type UpdateStepInput = {
  stepKey: StepKey;
  status: StepStatus;
  metadata?: Record<string, unknown> | undefined;
  blockedReason?: string | undefined;
};

const allowedStepKeys = new Set<string>(onboardingStepDefinitions.map((step) => step.key));

@Injectable()
export class OnboardingService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getStatus(context: TenantContext, branchId?: string | undefined) {
    const resolvedBranchId = await this.resolveBranchId(context, branchId);
    await this.ensureDefaultSteps(context, resolvedBranchId);
    return this.buildStatus(context, resolvedBranchId);
  }

  async updateStep(context: TenantContext, input: UpdateStepInput) {
    if (!allowedStepKeys.has(input.stepKey)) {
      throw new BadRequestException("Unknown onboarding step");
    }
    const definition = onboardingStepDefinitions.find((step) => step.key === input.stepKey);
    if (input.status === "skipped" && !definition?.skippable) {
      throw new BadRequestException("This onboarding step cannot be skipped");
    }

    const branchId = await this.resolveBranchId(context);
    const now = new Date();
    const [existing] = await this.database.db
      .select()
      .from(onboardingSteps)
      .where(
        and(
          eq(onboardingSteps.tenantId, context.tenantId),
          eq(onboardingSteps.branchId, branchId),
          eq(onboardingSteps.stepKey, input.stepKey),
        ),
      )
      .limit(1);

    const values = {
      tenantId: context.tenantId,
      branchId,
      stepKey: input.stepKey,
      status: input.status,
      updatedByUserId: context.userId,
      metadata: sanitizeMetadata(input.metadata),
      blockedReason:
        input.status === "blocked" ? (input.blockedReason ?? "Bloqueio operacional") : null,
      completedAt: input.status === "completed" ? now : null,
      skippedAt: input.status === "skipped" ? now : null,
      updatedAt: now,
    };

    const [step] = existing
      ? await this.database.db
          .update(onboardingSteps)
          .set(values)
          .where(
            and(
              eq(onboardingSteps.tenantId, context.tenantId),
              eq(onboardingSteps.id, existing.id),
            ),
          )
          .returning()
      : await this.database.db.insert(onboardingSteps).values(values).returning();

    if (!step) {
      throw new BadRequestException("Unable to update onboarding step");
    }

    await this.audit(
      context,
      branchId,
      `onboarding.step_${input.status}`,
      "onboarding_step",
      step.id,
      {
        stepKey: input.stepKey,
        status: input.status,
      },
    );

    return this.buildStatus(context, branchId);
  }

  async recalculateReadiness(context: TenantContext, branchId?: string | undefined) {
    const resolvedBranchId = await this.resolveBranchId(context, branchId);
    const status = await this.buildStatus(context, resolvedBranchId);
    await this.audit(
      context,
      resolvedBranchId,
      "onboarding.readiness_recalculated",
      "branch",
      resolvedBranchId,
      {
        readiness: status.readiness,
        progressPercent: status.progressPercent,
        blockers: status.blockers.map((blocker) => blocker.key),
      },
    );
    return status;
  }

  private async buildStatus(context: TenantContext, branchId: string) {
    const [counts] = await this.database.db
      .select({
        branches: sql<number>`count(distinct ${branches.id})::int`,
        tables: sql<number>`count(distinct ${diningTables.id})::int`,
        products: sql<number>`count(distinct ${products.id})::int`,
        categories: sql<number>`count(distinct ${categories.id})::int`,
        users: sql<number>`count(distinct ${users.id})::int`,
        roles: sql<number>`count(distinct ${roles.id})::int`,
        printers: sql<number>`count(distinct ${printerDevices.id})::int`,
        openCash: sql<number>`count(distinct ${cashSessions.id})::int`,
      })
      .from(branches)
      .leftJoin(
        diningTables,
        and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, branchId)),
      )
      .leftJoin(categories, eq(categories.tenantId, context.tenantId))
      .leftJoin(products, eq(products.tenantId, context.tenantId))
      .leftJoin(users, eq(users.tenantId, context.tenantId))
      .leftJoin(roles, eq(roles.tenantId, context.tenantId))
      .leftJoin(
        printerDevices,
        and(eq(printerDevices.tenantId, context.tenantId), eq(printerDevices.branchId, branchId)),
      )
      .leftJoin(
        cashSessions,
        and(
          eq(cashSessions.tenantId, context.tenantId),
          eq(cashSessions.branchId, branchId),
          eq(cashSessions.status, "open"),
        ),
      )
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)));

    const persisted = await this.database.db
      .select()
      .from(onboardingSteps)
      .where(
        and(eq(onboardingSteps.tenantId, context.tenantId), eq(onboardingSteps.branchId, branchId)),
      );
    const persistedByKey = new Map(persisted.map((step) => [step.stepKey, step]));

    const autoDone = new Map<StepKey, boolean>([
      ["business_profile", true],
      ["branch_setup", Number(counts?.branches ?? 0) > 0],
      ["team_roles", Number(counts?.users ?? 0) > 0 && Number(counts?.roles ?? 0) > 0],
      ["tables_setup", Number(counts?.tables ?? 0) > 0],
      ["catalog_setup", Number(counts?.products ?? 0) > 0 && Number(counts?.categories ?? 0) > 0],
      ["printer_setup", Number(counts?.printers ?? 0) > 0],
      ["cash_setup", true],
      ["qr_menu_setup", Number(counts?.products ?? 0) > 0],
      ["test_order", false],
      ["first_shift_ready", false],
    ]);

    const blockers = [
      Number(counts?.branches ?? 0) === 0
        ? { key: "branch_setup", label: "Nenhuma filial ativa encontrada." }
        : null,
      Number(counts?.tables ?? 0) === 0
        ? { key: "tables_setup", label: "Cadastre ao menos uma mesa." }
        : null,
      Number(counts?.products ?? 0) === 0
        ? { key: "catalog_setup", label: "Cadastre ao menos um produto." }
        : null,
      Number(counts?.users ?? 0) === 0
        ? { key: "team_roles", label: "Cadastre ou convide usuários da operação." }
        : null,
    ].filter(Boolean) as Array<{ key: string; label: string }>;

    const steps = onboardingStepDefinitions.map((definition) => {
      const persistedStep = persistedByKey.get(definition.key);
      const status =
        persistedStep?.status === "skipped" ||
        persistedStep?.status === "blocked" ||
        persistedStep?.status === "in_progress"
          ? persistedStep.status
          : autoDone.get(definition.key)
            ? "completed"
            : (persistedStep?.status ?? "pending");
      return {
        ...definition,
        status,
        updatedAt: persistedStep?.updatedAt?.toISOString() ?? null,
        blockedReason: persistedStep?.blockedReason ?? null,
        metadata: persistedStep?.metadata ?? {},
      };
    });

    const completed = steps.filter(
      (step) => step.status === "completed" || step.status === "skipped",
    ).length;
    const progressPercent = Math.round((completed / steps.length) * 100);
    const requiredReady = steps
      .filter((step) => !step.skippable && step.key !== "first_shift_ready")
      .every((step) => step.status === "completed");
    const readiness =
      requiredReady && blockers.length === 0
        ? "ready"
        : blockers.length > 0
          ? "blocked"
          : "in_progress";
    const nextStep =
      steps.find((step) => step.status === "pending" || step.status === "blocked") ?? null;

    return {
      tenantId: context.tenantId,
      branchId,
      readiness,
      progressPercent,
      completedSteps: completed,
      totalSteps: steps.length,
      counts: {
        branches: Number(counts?.branches ?? 0),
        tables: Number(counts?.tables ?? 0),
        products: Number(counts?.products ?? 0),
        categories: Number(counts?.categories ?? 0),
        users: Number(counts?.users ?? 0),
        roles: Number(counts?.roles ?? 0),
        printers: Number(counts?.printers ?? 0),
        openCashSessions: Number(counts?.openCash ?? 0),
      },
      blockers,
      nextStep,
      steps,
    };
  }

  private async ensureDefaultSteps(context: TenantContext, branchId: string) {
    for (const definition of onboardingStepDefinitions) {
      const [existing] = await this.database.db
        .select({ id: onboardingSteps.id })
        .from(onboardingSteps)
        .where(
          and(
            eq(onboardingSteps.tenantId, context.tenantId),
            eq(onboardingSteps.branchId, branchId),
            eq(onboardingSteps.stepKey, definition.key),
          ),
        )
        .limit(1);
      if (!existing) {
        await this.database.db.insert(onboardingSteps).values({
          tenantId: context.tenantId,
          branchId,
          stepKey: definition.key,
          status: "pending",
          metadata: {},
        });
      }
    }
  }

  private async resolveBranchId(context: TenantContext, requestedBranchId?: string | undefined) {
    const branchId = requestedBranchId ?? context.branchId;
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);
    if (!branch) {
      throw new NotFoundException("Branch not found");
    }
    return branch.id;
  }

  private async audit(
    context: TenantContext,
    branchId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType,
      entityId,
      metadata,
    });
  }
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(
        ([key]) =>
          !["token", "secret", "password", "cookie", "authorization"].includes(key.toLowerCase()),
      )
      .slice(0, 20),
  );
}
