import { Body, Controller, Get, Headers, Inject, Post, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { sessionCookie } from "../../common/http";
import { AuthService } from "./auth.service";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const inviteSchema = z.object({
  email: z.email(),
  roleCode: z.string().min(2),
  branchId: z.string().optional(),
});

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.authService.login(loginSchema.parse(body), headers);
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

  @Post("invitations")
  async createInvitation(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const input = inviteSchema.parse(body);
    const context = await this.authService.resolveContext(headers);

    if (!context.permissions.includes("tenant:manage")) {
      return {
        error: "forbidden",
        requiredPermission: "tenant:manage",
      };
    }

    return {
      id: "pending-implementation",
      tenantId: context.tenantId,
      email: input.email,
      roleCode: input.roleCode,
      branchId: input.branchId ?? null,
      status: "pending",
      delivery: "email_provider_mock",
    };
  }
}
