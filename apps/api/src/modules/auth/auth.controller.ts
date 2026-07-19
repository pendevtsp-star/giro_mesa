import { loadEnv } from "@giromesa/config";
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
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { createCsrfToken } from "../../common/csrf";
import type { HeaderRecord } from "../../common/http";
import { firstHeader, parseCookies, sessionCookie } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "./auth.service";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  mfaCode: z.string().min(6).max(12).optional(),
});

const startTrialSchema = z.object({
  establishmentName: z.string().min(2).max(160),
  ownerName: z.string().min(2).max(160),
  ownerEmail: z.email(),
  password: z.string().min(8),
  phone: z.string().max(32).optional(),
  document: z.string().max(32).optional(),
  branchName: z.string().min(2).max(140).default("Matriz"),
  planCode: z.enum(["starter", "professional", "premium"]).default("professional"),
});

const inviteSchema = z.object({
  email: z.email(),
  roleId: z.string().uuid().optional(),
  roleCode: z.string().min(2).optional(),
  branchId: z.string().optional(),
});

const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(20),
  name: z.string().min(2).max(160).optional(),
  password: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

const resetPasswordRequestSchema = z.object({
  email: z.email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

const mfaConfigureSchema = z.object({
  enabled: z.boolean(),
});

const mfaVerifySchema = z.object({
  code: z.string().min(6).max(12),
});

const googleStartSchema = z.object({
  returnTo: z.string().optional(),
  mode: z.enum(["login", "link"]).default("login"),
});

const googleCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const googleMfaCompleteSchema = z.object({
  challengeToken: z.string().min(20),
  code: z.string().min(6).max(12),
});

const updateRoleSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    permissions: z.array(z.string().min(2).max(120)).max(80).optional(),
  })
  .refine((input) => input.name !== undefined || input.permissions !== undefined, {
    message: "At least one field must be provided",
  });

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
  ) {}

  @Get("google/start")
  async googleStart(
    @Query() query: Record<string, string | undefined>,
    @Headers() headers: HeaderRecord,
    @Res() reply: FastifyReply,
  ) {
    this.rateLimitService.assertAllowed(headers, {
      namespace: "google_oauth_start",
      limit: 30,
      windowMs: 60_000,
    });
    const parsed = googleStartSchema.parse(query);
    if (parsed.mode === "link") {
      const context = await this.authService.resolveContext(headers);
      return reply.redirect(
        this.authService.googleAuthorizationUrl({
          mode: "link",
          ...(context.userId ? { userId: context.userId } : {}),
          ...(parsed.returnTo ? { returnTo: parsed.returnTo } : {}),
        }),
      );
    }

    return reply.redirect(
      this.authService.googleAuthorizationUrl({
        mode: "login",
        ...(parsed.returnTo ? { returnTo: parsed.returnTo } : {}),
      }),
    );
  }

  @Get("google/callback")
  async googleCallback(
    @Query() query: Record<string, string | undefined>,
    @Res() reply: FastifyReply,
    @Headers() headers: HeaderRecord,
  ) {
    this.rateLimitService.assertAllowed(headers, {
      namespace: "google_oauth_callback",
      limit: 60,
      windowMs: 60_000,
    });
    try {
      const result = await this.authService.completeGoogleLogin(
        googleCallbackSchema.parse(query),
        headers,
      );
      if (result.token) {
        reply.header("set-cookie", sessionCookie(result.token, result.maxAgeSeconds));
      }
      return reply.redirect(result.redirectTo);
    } catch {
      return reply.redirect(this.authService.googleFailureRedirect("google_sign_in_failed"));
    }
  }

  @Post("google/mfa/complete")
  async completeGoogleMfa(
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    rejectTenantOverride(body);
    const input = googleMfaCompleteSchema.parse(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "google_mfa_complete",
      limit: 6,
      windowMs: 60_000,
      identifier: input.challengeToken,
    });
    const result = await this.authService.completeGoogleMfa(input, headers);
    reply.header("set-cookie", sessionCookie(result.token, result.maxAgeSeconds));
    return {
      redirectTo: result.redirectTo,
      session: {
        tokenType: "cookie",
        expiresInSeconds: result.maxAgeSeconds,
      },
    };
  }

  @Post("login")
  async login(
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = loginSchema.parse(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "auth_login",
      limit: 8,
      windowMs: 60_000,
      identifier: input.email.toLowerCase(),
    });
    const session = await this.authService.login(input, headers);
    if (session.token) {
      reply.header("set-cookie", sessionCookie(session.token, session.maxAgeSeconds));
    }

    return {
      user: session.user,
      session: {
        tokenType: "cookie",
        mfaRequired: session.mfaRequired,
        expiresInSeconds: session.maxAgeSeconds,
      },
    };
  }

  @Post("trial")
  async startTrial(
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    rejectTenantOverride(body);
    const input = startTrialSchema.parse(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "auth_trial_signup",
      limit: 5,
      windowMs: 60_000,
      identifier: input.ownerEmail.toLowerCase(),
    });
    const session = await this.authService.startTrial(input, headers);
    reply.header("set-cookie", sessionCookie(session.token, session.maxAgeSeconds));

    return {
      user: session.user,
      tenant: session.tenant,
      subscription: session.subscription,
      session: {
        tokenType: "cookie",
        mfaRequired: false,
        expiresInSeconds: session.maxAgeSeconds,
      },
    };
  }

  @Get("me")
  async me(@Headers() headers: HeaderRecord) {
    return {
      context: await this.authService.resolveContext(headers),
    };
  }

  @Get("csrf")
  async csrf(@Headers() headers: HeaderRecord) {
    await this.authService.resolveContext(headers);
    const token = parseCookies(firstHeader(headers.cookie)).get("gm_session");
    if (!token) {
      throw new UnauthorizedException("Missing session");
    }

    return {
      csrfToken: createCsrfToken(token, loadEnv().SESSION_SECRET),
    };
  }

  @Post("logout")
  async logout(@Headers() headers: HeaderRecord, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.authService.revokeCurrentSession(headers);
    reply.header("set-cookie", sessionCookie("", 0));
    return result;
  }

  @Get("roles")
  async listRoles(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");

    return {
      data: await this.authService.listRoles(context),
    };
  }

  @Get("users")
  async listUsers(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");

    return {
      data: await this.authService.listUsers(context),
    };
  }

  @Get("oauth/accounts")
  async listOauthAccounts(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return {
      data: await this.authService.listOauthAccounts(context),
    };
  }

  @Get("invitations")
  async listInvitations(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");

    return {
      data: await this.authService.listInvitations(context),
    };
  }

  @Patch("roles/:roleId")
  async updateRole(
    @Param("roleId") roleId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const input = updateRoleSchema.parse(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");

    return this.authService.updateRole(context, roleId, input);
  }

  @Post("invitations")
  async createInvitation(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const input = inviteSchema.parse(body);
    const context = await this.authService.resolveContext(headers);

    requirePermission(context, "tenant:manage");

    return this.authService.createInvitation(context, input);
  }

  @Post("invitations/:invitationId/resend")
  async resendInvitation(
    @Param("invitationId") invitationId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");

    return this.authService.resendInvitation(context, invitationId);
  }

  @Post("invitations/:invitationId/cancel")
  async cancelInvitation(
    @Param("invitationId") invitationId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");

    return this.authService.cancelInvitation(context, invitationId);
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    rejectTenantOverride(body);
    const input = acceptInvitationSchema.parse(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "invitation_accept",
      limit: 6,
      windowMs: 60_000,
      identifier: input.token,
    });
    const session = await this.authService.acceptInvitation(input, headers);
    reply.header("set-cookie", sessionCookie(session.token, session.maxAgeSeconds));

    return {
      user: session.user,
      session: {
        tokenType: "cookie",
        mfaRequired: false,
        expiresInSeconds: session.maxAgeSeconds,
      },
    };
  }

  @Post("password/change")
  async changePassword(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const input = changePasswordSchema.parse(body);
    const context = await this.authService.resolveContext(headers);

    return this.authService.changePassword(context, input);
  }

  @Post("password/reset/request")
  async requestPasswordReset(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const input = resetPasswordRequestSchema.parse(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "password_reset_request",
      limit: 5,
      windowMs: 60_000,
      identifier: input.email.toLowerCase(),
    });
    return this.authService.requestPasswordReset(input, headers);
  }

  @Post("password/reset/complete")
  async resetPassword(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const input = resetPasswordSchema.parse(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "password_reset_complete",
      limit: 6,
      windowMs: 60_000,
      identifier: input.token,
    });
    return this.authService.resetPassword(input, headers);
  }

  @Post("mfa/configure")
  async configureMfa(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const input = mfaConfigureSchema.parse(body);
    const context = await this.authService.resolveContext(headers);
    return this.authService.configureMfa(context, input.enabled);
  }

  @Post("mfa/setup")
  async setupMfa(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return this.authService.setupMfa(context);
  }

  @Post("mfa/verify")
  async verifyMfa(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const input = mfaVerifySchema.parse(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "mfa_verify",
      limit: 8,
      windowMs: 60_000,
    });
    const context = await this.authService.resolveContext(headers);
    return this.authService.verifyMfaSetup(context, input.code);
  }

  @Post("mfa/recovery-codes/regenerate")
  async regenerateRecoveryCodes(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const input = mfaVerifySchema.parse(body);
    const context = await this.authService.resolveContext(headers);
    return this.authService.regenerateRecoveryCodes(context, input.code);
  }

  @Post("oauth/google/unlink")
  async unlinkGoogleAccount(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return this.authService.unlinkGoogleAccount(context);
  }

  @Post("users/:userId/roles")
  async assignUserRole(
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const input = assignRoleSchema.parse(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");

    return this.authService.assignUserRole(context, userId, input);
  }
}
