import { roles, sessions, userRoles, users } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { HeaderRecord } from "../../common/http";
import {
  createSessionToken,
  hashOpaqueToken,
  parseCookies,
  requestIdFromHeaders,
} from "../../common/http";
import { verifyPassword } from "../../common/password";
import { DatabaseService } from "../database/database.service";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type LoginInput = {
  email: string;
  password: string;
};

export type SessionUser = {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  isPlatformUser: boolean;
  permissions: string[];
};

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async login(input: LoginInput, headers: HeaderRecord) {
    const normalizedEmail = input.email.toLowerCase();
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), eq(users.isActive, true)))
      .limit(1);

    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isValid = await verifyPassword(user.passwordHash, input.password);
    if (!isValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const access = await this.accessForUser(user.id);
    const { token, tokenHash } = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

    await this.database.db.insert(sessions).values({
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash,
      userAgent: Array.isArray(headers["user-agent"])
        ? headers["user-agent"][0]
        : headers["user-agent"],
      ipAddress: Array.isArray(headers["x-forwarded-for"])
        ? headers["x-forwarded-for"][0]
        : headers["x-forwarded-for"],
      expiresAt,
    });

    return {
      token,
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        isPlatformUser: user.isPlatformUser,
        permissions: access.permissions,
      } satisfies SessionUser,
    };
  }

  async resolveContext(headers: HeaderRecord): Promise<TenantContext> {
    const requestId = requestIdFromHeaders(headers);
    const cookieHeader = Array.isArray(headers.cookie) ? headers.cookie[0] : headers.cookie;
    const token = parseCookies(cookieHeader).get("gm_session");

    if (!token) {
      throw new UnauthorizedException("Missing session");
    }

    const [session] = await this.database.db
      .select({
        id: sessions.id,
        tenantId: sessions.tenantId,
        userId: sessions.userId,
        email: users.email,
        userName: users.name,
        isPlatformUser: users.isPlatformUser,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashOpaqueToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!session) {
      throw new UnauthorizedException("Invalid session");
    }

    const access = await this.accessForUser(session.userId);
    if (!session.tenantId && !session.isPlatformUser) {
      throw new UnauthorizedException("Session has no tenant");
    }

    return {
      tenantId: session.tenantId ?? "platform",
      userId: session.userId,
      requestId,
      permissions: access.permissions,
      ...(access.branchId ? { branchId: access.branchId } : {}),
    };
  }

  async revokeCurrentSession(headers: HeaderRecord) {
    const cookieHeader = Array.isArray(headers.cookie) ? headers.cookie[0] : headers.cookie;
    const token = parseCookies(cookieHeader).get("gm_session");
    if (!token) {
      return { revoked: false };
    }

    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashOpaqueToken(token)));

    return { revoked: true };
  }

  private async accessForUser(userId: string) {
    const rows = await this.database.db
      .select({
        permissions: roles.permissions,
        branchId: userRoles.branchId,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));

    return {
      permissions: [...new Set(rows.flatMap((row) => row.permissions))],
      branchId: rows.find((row) => row.branchId)?.branchId,
    };
  }
}
