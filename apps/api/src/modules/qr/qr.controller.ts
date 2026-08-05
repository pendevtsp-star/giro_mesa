import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  Sse,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { distinctUntilChanged, filter, from, interval, map, startWith, switchMap } from "rxjs";
import { z } from "zod";
import { firstHeader, type HeaderRecord, parseCookies } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { OperationalRealtimeService, publicDeltaBatch } from "../pos/operational-realtime.service";
import { QrService } from "./qr.service";

const capabilities = z.enum([
  "menu",
  "order",
  "review_before_kds",
  "track_preparation",
  "view_tab",
  "call_waiter",
  "request_pre_bill",
]);

const settingsSchema = z
  .object({
    mode: z.enum(["disabled", "menu_only", "waiter_assisted", "self_service"]).optional(),
    presenceMethods: z
      .array(z.enum(["code", "approval", "network"]))
      .min(1)
      .max(3)
      .optional(),
    tabVisibility: z.enum(["shared", "own_items"]).optional(),
    presenceCodeTtlMinutes: z.number().int().min(1).max(120).optional(),
    guestSessionTtlMinutes: z.number().int().min(5).max(1440).optional(),
    trustedNetworkCidrs: z.array(z.string().max(64)).max(24).optional(),
    capabilities: z.array(capabilities).min(1).optional(),
    reviewBeforeKds: z.boolean().optional(),
    template: z
      .enum(["classic", "minimal", "premium", "gastronomia", "bar_noturno", "cafe", "doseclub"])
      .optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    instruction: z.string().min(4).max(180).optional(),
    showLogo: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one QR setting is required",
  });

export const qrExperienceSchema = z
  .object({
    capabilities: z.array(capabilities).min(1).optional(),
    reviewBeforeKds: z.boolean().optional(),
    template: z
      .enum(["classic", "minimal", "premium", "gastronomia", "bar_noturno", "cafe", "doseclub"])
      .optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    instruction: z.string().min(4).max(180).optional(),
    showLogo: z.boolean().optional(),
    fontPreset: z.enum(["system", "serif", "display"]).optional(),
    welcomeMessage: z.string().max(180).optional(),
    menuHeadline: z.string().max(120).optional(),
    marketingEnabled: z.boolean().optional(),
    coverUrl: z
      .preprocess(
        (value) => (value === "" ? null : value),
        z
          .string()
          .max(500)
          .refine(
            (value) => value.startsWith("https://") || /^\/uploads\/[A-Za-z0-9._/-]+$/.test(value),
            "Capa deve usar HTTPS ou um arquivo local em /uploads/",
          )
          .nullable(),
      )
      .optional(),
    language: z.enum(["pt-BR", "en", "es"]).optional(),
    highlights: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
    campaignMessage: z.string().trim().max(180).optional(),
    houseInfo: z.string().trim().max(300).optional(),
    categoryLabels: z
      .record(z.string().uuid(), z.string().trim().min(1).max(80))
      .refine((value) => Object.keys(value).length <= 30, "No more than 30 category labels")
      .optional(),
    recommendedProductIds: z.array(z.string().uuid()).max(12).optional(),
    serviceRequestReasons: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
    scheduledAt: z.coerce
      .date()
      .refine(
        (value) => value.getTime() > Date.now(),
        "Scheduled publication must be in the future",
      )
      .optional(),
  })
  .strict();

const attributionSchema = z.object({
  destination: z.enum(["giromesa", "doseclub"]),
});

const rollbackExperienceSchema = z.object({
  revisionId: z.string().uuid(),
});

const scheduleExperienceSchema = z.object({
  scheduledAt: z.coerce
    .date()
    .refine((value) => value.getTime() > Date.now(), "Scheduled publication must be in the future"),
});

const artworkSchema = z.object({
  tableIds: z.array(z.string().uuid()).min(1).max(200),
  format: z.enum(["svg", "png", "pdf"]).default("svg"),
  size: z.enum(["plate_10x15", "sticker_8x8", "a4"]).default("plate_10x15"),
});

const orderSchema = z.object({
  guestLabel: z.string().trim().min(1).max(60).optional(),
  ageConfirmationToken: z.string().min(16).max(2_048).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().max(300).optional(),
        modifiers: z
          .array(z.object({ optionId: z.string().uuid() }))
          .max(20)
          .optional(),
      }),
    )
    .min(1)
    .max(80),
});

const requestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.enum(["call_waiter", "request_pre_bill", "need_help"]),
      message: z.string().max(180).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("split_intent"),
      message: z.string().max(180).optional(),
      split: z
        .object({
          mode: z.enum(["equal", "by_item", "custom"]),
          people: z.number().int().min(2).max(100).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("payment_preference"),
      message: z.string().max(180).optional(),
      payment: z
        .object({
          method: z.enum(["cash", "pix", "credit_card", "debit_card", "other"]),
          splitMode: z.enum(["single", "equal", "by_item", "custom"]).optional(),
        })
        .strict(),
    })
    .strict(),
]);

const ageConfirmationSchema = z.object({ confirmed: z.literal(true) });
const presenceCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const presenceApprovalClaimSchema = z.object({ claimKey: z.string().min(32).max(256) });
const revokeTableServiceSchema = z.object({ reason: z.string().trim().min(3).max(240).optional() });

@Controller("qr")
export class QrController {
  constructor(
    @Inject(QrService) private readonly qrService: QrService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Optional()
    @Inject(OperationalRealtimeService)
    private readonly realtime?: OperationalRealtimeService,
  ) {}

  @Get("settings")
  async settings(@Headers() headers: HeaderRecord) {
    const context = await this.manageContext(headers);
    return this.qrService.getSettings(context);
  }

  @Patch("settings")
  async updateSettings(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.qrService.updateSettings(
      await this.manageContext(headers),
      settingsSchema.parse(body),
    );
  }

  @Get("experience")
  async experience(@Headers() headers: HeaderRecord) {
    return this.qrService.getExperience(await this.manageContext(headers));
  }

  @Post("experience/draft")
  async experienceDraft(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.qrService.createExperienceDraft(
      await this.manageContext(headers),
      qrExperienceSchema.parse(body),
    );
  }

  @Post("experience/preview")
  async experiencePreview(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.qrService.previewExperience(
      await this.manageContext(headers),
      qrExperienceSchema.parse(body),
    );
  }

  @Post("experience/:revisionId/schedule")
  async scheduleExperience(
    @Headers() headers: HeaderRecord,
    @Param("revisionId") revisionId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const { scheduledAt } = scheduleExperienceSchema.parse(body);
    return this.qrService.scheduleExperience(
      await this.manageContext(headers),
      z.string().uuid().parse(revisionId),
      scheduledAt,
    );
  }

  @Post("experience/:revisionId/publish")
  async publishExperience(
    @Headers() headers: HeaderRecord,
    @Param("revisionId") revisionId: string,
  ) {
    return this.qrService.publishExperience(
      await this.manageContext(headers),
      z.string().uuid().parse(revisionId),
    );
  }

  @Post("experience/rollback")
  async rollbackExperience(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const { revisionId } = rollbackExperienceSchema.parse(body);
    return this.qrService.rollbackExperience(await this.manageContext(headers), revisionId);
  }

  @Get("tables")
  async tables(@Headers() headers: HeaderRecord) {
    return { data: await this.qrService.listTables(await this.manageContext(headers)) };
  }

  @Post("tables/:tableId/rotate")
  async rotate(@Headers() headers: HeaderRecord, @Param("tableId") tableId: string) {
    return this.qrService.rotate(
      await this.manageContext(headers),
      z.string().uuid().parse(tableId),
    );
  }

  @Post("tables/:tableId/service-session")
  async activateTableService(@Headers() headers: HeaderRecord, @Param("tableId") tableId: string) {
    const context = await this.operateContext(headers);
    const expectedTableVersion = optionalExpectedVersion(headers);
    return this.qrService.activateTableService(context, z.string().uuid().parse(tableId), {
      idempotencyKey: optionalIdempotencyKey(headers) ?? context.requestId,
      ...(expectedTableVersion !== undefined ? { expectedTableVersion } : {}),
    });
  }

  @Post("tables/:tableId/service-session/revoke")
  async revokeTableService(
    @Headers() headers: HeaderRecord,
    @Param("tableId") tableId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const input = revokeTableServiceSchema.parse(body);
    return this.qrService.revokeTableService(
      await this.operateContext(headers),
      z.string().uuid().parse(tableId),
      input.reason,
    );
  }

  @Post("artwork")
  async artwork(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.qrService.createArtwork(
      await this.manageContext(headers),
      artworkSchema.parse(body),
    );
  }

  @Get("public/:token/context")
  async publicContext(@Param("token") token: string, @Headers() headers: HeaderRecord) {
    return this.qrService.getPublicContext(token, publicGuestToken(headers));
  }

  @Post("public/:token/presence/code")
  async publicValidatePresenceCode(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-presence-code",
      limit: 8,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    const result = await this.qrService.validatePresenceCode(
      token,
      presenceCodeSchema.parse(body).code,
    );
    response.header("set-cookie", publicGuestCookie(result.token, result.maxAgeSeconds));
    return { expiresAt: result.expiresAt, validationMethod: result.validationMethod };
  }

  @Post("public/:token/presence/approval")
  async publicRequestPresenceApproval(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Req() request: FastifyRequest,
  ) {
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-presence-approval-request",
      limit: 6,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    return this.qrService.requestPresenceApproval(token);
  }

  @Post("public/:token/presence/network")
  async publicValidatePresenceNetwork(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-presence-network",
      limit: 8,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    const result = await this.qrService.validatePresenceNetwork(token, request.ip);
    response.header("set-cookie", publicGuestCookie(result.token, result.maxAgeSeconds));
    return { expiresAt: result.expiresAt, validationMethod: result.validationMethod };
  }

  @Post("public/:token/presence/approval/:requestId/claim")
  async publicClaimPresenceApproval(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-presence-approval-claim",
      limit: 8,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    const result = await this.qrService.claimPresenceApproval(
      token,
      z.string().uuid().parse(requestId),
      presenceApprovalClaimSchema.parse(body).claimKey,
    );
    if (result.status !== "approved") return result;
    response.header("set-cookie", publicGuestCookie(result.token, result.maxAgeSeconds));
    return { status: result.status, expiresAt: result.expiresAt };
  }

  @Post("presence-approvals/:requestId/approve")
  async approvePresenceRequest(
    @Headers() headers: HeaderRecord,
    @Param("requestId") requestId: string,
  ) {
    return this.qrService.approvePresenceRequest(
      await this.operateContext(headers),
      z.string().uuid().parse(requestId),
    );
  }

  @Get("presence-approvals")
  async listPresenceApprovals(
    @Headers() headers: HeaderRecord,
    @Query("status") status?: "pending" | "approved" | "rejected" | "claimed" | "expired",
  ) {
    const parsedStatus = z
      .enum(["pending", "approved", "rejected", "claimed", "expired"])
      .optional()
      .parse(status);
    return {
      data: await this.qrService.listPresenceApprovals(
        await this.operateContext(headers),
        parsedStatus,
      ),
    };
  }

  @Get("public/:token/order")
  async publicOrder(@Headers() headers: HeaderRecord, @Param("token") token: string) {
    return this.qrService.getPublicOrder(token, publicGuestToken(headers));
  }

  @Sse("public/:token/events")
  async publicEvents(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Req() request: FastifyRequest,
  ) {
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-events",
      limit: 30,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });

    return interval(5_000).pipe(
      startWith(0),
      switchMap(() => from(this.qrService.getPublicOrder(token, publicGuestToken(headers)))),
      distinctUntilChanged(
        (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
      ),
      map((snapshot) => ({
        id: JSON.stringify(snapshot.order?.id ?? null),
        type: "qr.order.changed",
        retry: 5_000,
        data: snapshot,
      })),
    );
  }

  @Sse("public/:token/events/delta")
  async publicDeltaEvents(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Req() request: FastifyRequest,
  ) {
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-events-delta",
      limit: 30,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    const scope = await this.qrService.getPublicRealtimeScope(token, publicGuestToken(headers));
    if (!this.realtime) throw new ServiceUnavailableException("Realtime service is unavailable");
    return this.realtime.stream(scope.tenantId, scope.branchId).pipe(
      map((batch) => publicDeltaBatch(batch, scope)),
      filter((batch) => batch !== null),
      map((batch) => ({
        id: String(batch.toVersion),
        type: "qr.operation.delta",
        retry: 1_000,
        data: batch,
      })),
    );
  }

  @Post("public/:token/orders")
  async publicCreateOrder(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const idempotencyKey = requiredIdempotencyKey(headers);
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-order",
      limit: 12,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    return this.qrService.createPublicOrder(
      token,
      idempotencyKey,
      orderSchema.parse(body),
      publicGuestToken(headers),
    );
  }

  @Post("public/:token/age-confirmation")
  async publicAgeConfirmation(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    ageConfirmationSchema.parse(body);
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-age-confirmation",
      limit: 6,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    return this.qrService.createAgeConfirmation(token, publicGuestToken(headers));
  }

  @Post("public/:token/service-requests")
  async publicServiceRequest(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const idempotencyKey = requiredIdempotencyKey(headers);
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-service-request",
      limit: 6,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    return this.qrService.createServiceRequest(
      token,
      idempotencyKey,
      requestSchema.parse(body),
      publicGuestToken(headers),
    );
  }

  @Post("public/:token/attribution")
  async publicAttribution(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    await this.rateLimit.assertDistributedAllowed(headers, {
      namespace: "qr-attribution",
      limit: 12,
      windowMs: 60_000,
      identifier: `${token}:${request.ip}`,
    });
    return this.qrService.recordCommercialAttribution(
      token,
      attributionSchema.parse(body).destination,
    );
  }

  @Get("public/:token/service-requests/:id")
  async publicServiceRequestStatus(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Param("id") id: string,
  ) {
    return this.qrService.getPublicServiceRequest(
      token,
      z.string().uuid().parse(id),
      publicGuestToken(headers),
    );
  }

  @Get("service-requests")
  async serviceRequests(@Headers() headers: HeaderRecord, @Query("status") status?: string) {
    const context = await this.operateContext(headers);
    const parsedStatus = status
      ? z.enum(["pending", "acknowledged", "resolved", "canceled"]).parse(status)
      : undefined;
    return { data: await this.qrService.listServiceRequests(context, parsedStatus) };
  }

  @Post("service-requests/:id/acknowledge")
  async acknowledge(@Headers() headers: HeaderRecord, @Param("id") id: string) {
    return this.qrService.acknowledge(
      await this.operateContext(headers),
      z.string().uuid().parse(id),
    );
  }

  @Post("service-requests/:id/resolve")
  async resolve(@Headers() headers: HeaderRecord, @Param("id") id: string) {
    return this.qrService.resolve(await this.operateContext(headers), z.string().uuid().parse(id));
  }

  private async manageContext(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return context;
  }

  private async operateContext(headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "pos:operate");
    return context;
  }
}

function requiredIdempotencyKey(headers: HeaderRecord) {
  const value = firstHeader(headers["x-idempotency-key"])?.trim();
  if (!value || value.length < 8 || value.length > 160) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["x-idempotency-key"],
        message: "x-idempotency-key header must contain between 8 and 160 characters",
      },
    ]);
  }
  return value;
}

function optionalIdempotencyKey(headers: HeaderRecord) {
  const value = firstHeader(headers["x-idempotency-key"])?.trim();
  if (!value) return undefined;
  return z.string().min(8).max(180).parse(value);
}

function optionalExpectedVersion(headers: HeaderRecord) {
  const value = firstHeader(headers["x-expected-version"])?.trim();
  if (!value) return undefined;
  return z.coerce.number().int().positive().parse(value);
}

function publicGuestCookie(token: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `gm_qr_guest=${encodeURIComponent(token)}; HttpOnly;${secure} SameSite=Lax; Path=/api/v1/qr/public; Max-Age=${maxAgeSeconds}`;
}

function publicGuestToken(headers: HeaderRecord) {
  return parseCookies(firstHeader(headers.cookie)).get("gm_qr_guest");
}
