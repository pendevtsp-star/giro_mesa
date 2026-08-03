import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from "@nestjs/common";
import { distinctUntilChanged, from, interval, map, startWith, switchMap } from "rxjs";
import { z } from "zod";
import { firstHeader, type HeaderRecord } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
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

const experienceSchema = z.object({
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
  welcomeMessage: z.string().max(180).optional(),
  menuHeadline: z.string().max(120).optional(),
  marketingEnabled: z.boolean().optional(),
  scheduledAt: z.coerce
    .date()
    .refine((value) => value.getTime() > Date.now(), "Scheduled publication must be in the future")
    .optional(),
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

const requestSchema = z.object({
  type: z.enum(["call_waiter", "request_pre_bill", "need_help"]),
  message: z.string().max(180).optional(),
});

@Controller("qr")
export class QrController {
  constructor(
    @Inject(QrService) private readonly qrService: QrService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
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
      experienceSchema.parse(body),
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

  @Post("artwork")
  async artwork(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.qrService.createArtwork(
      await this.manageContext(headers),
      artworkSchema.parse(body),
    );
  }

  @Get("public/:token/context")
  async publicContext(@Param("token") token: string) {
    return this.qrService.getPublicContext(token);
  }

  @Get("public/:token/order")
  async publicOrder(@Param("token") token: string) {
    return this.qrService.getPublicOrder(token);
  }

  @Sse("public/:token/events")
  publicEvents(@Headers() headers: HeaderRecord, @Param("token") token: string) {
    this.rateLimit.assertAllowed(headers, {
      namespace: "qr-events",
      limit: 30,
      windowMs: 60_000,
      identifier: `${token}:${firstHeader(headers["x-forwarded-for"]) ?? "direct"}`,
    });

    return interval(5_000).pipe(
      startWith(0),
      switchMap(() => from(this.qrService.getPublicOrder(token))),
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

  @Post("public/:token/orders")
  async publicCreateOrder(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Body() body: unknown,
  ) {
    const idempotencyKey = requiredIdempotencyKey(headers);
    this.rateLimit.assertAllowed(headers, {
      namespace: "qr-order",
      limit: 12,
      windowMs: 60_000,
      identifier: `${token}:${firstHeader(headers["x-forwarded-for"]) ?? "direct"}`,
    });
    return this.qrService.createPublicOrder(token, idempotencyKey, orderSchema.parse(body));
  }

  @Post("public/:token/service-requests")
  async publicServiceRequest(
    @Headers() headers: HeaderRecord,
    @Param("token") token: string,
    @Body() body: unknown,
  ) {
    const idempotencyKey = requiredIdempotencyKey(headers);
    this.rateLimit.assertAllowed(headers, {
      namespace: "qr-service-request",
      limit: 6,
      windowMs: 60_000,
      identifier: `${token}:${firstHeader(headers["x-forwarded-for"]) ?? "direct"}`,
    });
    return this.qrService.createServiceRequest(token, idempotencyKey, requestSchema.parse(body));
  }

  @Get("public/:token/service-requests/:id")
  async publicServiceRequestStatus(@Param("token") token: string, @Param("id") id: string) {
    return this.qrService.getPublicServiceRequest(token, z.string().uuid().parse(id));
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
