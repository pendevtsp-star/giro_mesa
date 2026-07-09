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
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { sessionCookie } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "./auth.service";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  mfaCode: z.string().min(6).max(12).optional(),
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
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("google/start")
  async googleStart(
    @Query() query: Record<string, string | undefined>,
    @Headers() headers: HeaderRecord,
    @Res() reply: FastifyReply,
  ) {
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
    const result = await this.authService.completeGoogleMfa(
      googleMfaCompleteSchema.parse(body),
      headers,
    );
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
    const session = await this.authService.login(loginSchema.parse(body), headers);
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

  @Get("me")
  async me(@Headers() headers: HeaderRecord) {
    return {
      context: await this.authService.resolveContext(headers),
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
    const session = await this.authService.acceptInvitation(
      acceptInvitationSchema.parse(body),
      headers,
    );
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
    return this.authService.requestPasswordReset(resetPasswordRequestSchema.parse(body), headers);
  }

  @Post("password/reset/complete")
  async resetPassword(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    return this.authService.resetPassword(resetPasswordSchema.parse(body), headers);
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
