import { loadEnv } from "@giromesa/config";
import {
  auditLogs,
  branches,
  invitations,
  mfaRecoveryCodes,
  oauthAccounts,
  passwordResetTokens,
  plans,
  roles,
  sessions,
  subscriptions,
  tenants,
  userRoles,
  users,
} from "@giromesa/db";
import {
  billingStatusForTenant,
  createTrialWindow,
  type DocumentBranding,
  renderBrandedEmail,
  type TenantContext,
  TRIAL_DAYS,
  trialDaysRemaining,
} from "@giromesa/domain";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { createEmailProvider } from "../../common/email-provider";
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  verifyGoogleIdToken,
} from "../../common/google-oauth";
import type { HeaderRecord } from "../../common/http";
import {
  createSessionToken,
  hashOpaqueToken,
  parseCookies,
  requestIdFromHeaders,
} from "../../common/http";
import { createOauthChallenge, verifyOauthChallenge } from "../../common/oauth-challenge";
import { createOauthState, verifyOauthState } from "../../common/oauth-state";
import { hashPassword, verifyPassword } from "../../common/password";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "../../common/recovery-codes";
import { decryptSecret, encryptSecret } from "../../common/secret-vault";
import { createOtpAuthUrl, generateTotpSecret, verifyTotpCode } from "../../common/totp";
import { DatabaseService } from "../database/database.service";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const MFA_ISSUER = process.env.MFA_ISSUER ?? "GiroMesa";
const PASSWORD_POLICY_MESSAGE =
  "Password must have at least 8 characters, uppercase, lowercase, number and symbol";
const planCatalog: Record<
  StartTrialInput["planCode"],
  { name: string; priceCents: number; limits: Record<string, number> }
> = {
  starter: { name: "Starter", priceCents: 14900, limits: { branches: 1, users: 5, products: 150 } },
  professional: {
    name: "Professional",
    priceCents: 29900,
    limits: { branches: 2, users: 15, products: 600 },
  },
  premium: {
    name: "Premium",
    priceCents: 49900,
    limits: { branches: 5, users: 40, products: 2000 },
  },
};

export type LoginInput = {
  email: string;
  password: string;
  mfaCode?: string | undefined;
};

export type StartTrialInput = {
  establishmentName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  phone?: string | undefined;
  document?: string | undefined;
  branchName: string;
  planCode: "starter" | "professional" | "premium";
};

export type SessionUser = {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  isPlatformUser: boolean;
  permissions: string[];
};

export type UpdateRoleInput = {
  name?: string | undefined;
  permissions?: string[] | undefined;
};

export type CreateInvitationInput = {
  email: string;
  roleId?: string | undefined;
  roleCode?: string | undefined;
  branchId?: string | undefined;
};

export type AssignUserRoleInput = {
  roleId: string;
  branchId?: string | undefined;
};

export type AcceptInvitationInput = {
  token: string;
  name?: string | undefined;
  password: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type ResetPasswordInput = {
  token: string;
  password: string;
};

export type GoogleCallbackInput = {
  code?: string | undefined;
  state?: string | undefined;
  error?: string | undefined;
};

export type GoogleMfaCompleteInput = {
  challengeToken: string;
  code: string;
};

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  googleAuthorizationUrl(input: { returnTo?: string; mode?: "login" | "link"; userId?: string }) {
    const env = loadEnv();
    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
      throw new BadRequestException("Google OAuth is not configured");
    }

    const safeReturnTo = sanitizeReturnTo(input.returnTo);

    return buildGoogleAuthorizationUrl({
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      redirectUri: this.googleRedirectUri(),
      state: createOauthState({
        provider: "google",
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(safeReturnTo ? { returnTo: safeReturnTo } : {}),
      }),
    });
  }

  googleFailureRedirect(reason: string) {
    const loginUrl = new URL("/login", this.publicWebUrl());
    loginUrl.searchParams.set("oauth", reason);
    return loginUrl.toString();
  }

  googleMfaRedirect(challengeToken: string) {
    const loginUrl = new URL("/login", this.publicWebUrl());
    loginUrl.searchParams.set("oauth", "google_mfa_required");
    loginUrl.searchParams.set("challenge", challengeToken);
    return loginUrl.toString();
  }

  async completeGoogleLogin(input: GoogleCallbackInput, headers: HeaderRecord) {
    if (input.error) {
      throw new UnauthorizedException("Google authorization failed");
    }
    if (!input.code) {
      throw new BadRequestException("Missing Google authorization code");
    }

    const state = verifyOauthState(input.state);
    if (!state) {
      throw new UnauthorizedException("Invalid Google OAuth state");
    }

    const env = loadEnv();
    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
      throw new BadRequestException("Google OAuth is not configured");
    }

    const tokenResponse = await exchangeGoogleCode({
      code: input.code,
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: this.googleRedirectUri(),
    });

    if (!tokenResponse.id_token) {
      throw new UnauthorizedException("Google id_token is missing");
    }

    const verifiedIdToken = await verifyGoogleIdToken({
      idToken: tokenResponse.id_token,
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    });
    const profile = await fetchGoogleUserInfo(tokenResponse.access_token);
    if (
      !profile.email ||
      profile.email_verified !== true ||
      !verifiedIdToken.email ||
      verifiedIdToken.email_verified !== true
    ) {
      throw new UnauthorizedException("Google account email is not verified");
    }
    if (
      profile.sub !== verifiedIdToken.sub ||
      profile.email.toLowerCase() !== verifiedIdToken.email.toLowerCase()
    ) {
      throw new UnauthorizedException("Google profile mismatch");
    }

    const normalizedEmail = profile.email.toLowerCase();
    const mode = input.state ? (verifyOauthState(input.state)?.mode ?? "login") : "login";

    if (mode === "link") {
      const context = await this.resolveContext(headers);
      if (!context.userId) {
        throw new UnauthorizedException("Missing session for Google account linking");
      }

      const state = verifyOauthState(input.state);
      if (!state || state.userId !== context.userId) {
        throw new UnauthorizedException("Invalid Google link state");
      }

      const [user] = await this.database.db
        .select({
          id: users.id,
          tenantId: users.tenantId,
          email: users.email,
          name: users.name,
          isPlatformUser: users.isPlatformUser,
          isActive: users.isActive,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(and(eq(users.id, context.userId), eq(users.isActive, true)))
        .limit(1);

      if (!user) {
        throw new UnauthorizedException("User not found for Google linking");
      }

      await this.upsertOauthAccount(user, {
        provider: "google",
        providerUserId: profile.sub,
        email: normalizedEmail,
        profile: {
          email: normalizedEmail,
          name: profile.name ?? verifiedIdToken.name ?? user.name,
          picture: profile.picture ?? verifiedIdToken.picture ?? null,
        },
      });

      await this.database.db.insert(auditLogs).values({
        tenantId: user.tenantId,
        branchId: context.branchId,
        userId: user.id,
        requestId: context.requestId,
        action: "auth.google_linked",
        entityType: "user",
        entityId: user.id,
        metadata: {
          email: normalizedEmail,
          googleSub: profile.sub,
        },
      });

      return {
        redirectTo: new URL(
          sanitizeReturnTo(state.returnTo) ?? "/app/security",
          this.publicWebUrl(),
        ).toString(),
      };
    }

    const linkedAccount = await this.findOauthAccount("google", profile.sub);
    const [user] = linkedAccount
      ? await this.database.db
          .select()
          .from(users)
          .where(and(eq(users.id, linkedAccount.userId), eq(users.isActive, true)))
          .limit(1)
      : await this.database.db
          .select()
          .from(users)
          .where(and(eq(users.email, normalizedEmail), eq(users.isActive, true)))
          .limit(1);

    if (!user) {
      throw new UnauthorizedException("Google account is not linked to an existing user");
    }

    await this.assertTenantCanAccess(user.tenantId, user.isPlatformUser);
    const access = await this.accessForUser(user.id);

    if (user.mfaEnabled) {
      const challengeToken = createOauthChallenge({
        kind: "google_mfa",
        userId: user.id,
        tenantId: user.tenantId,
        providerUserId: profile.sub,
        email: normalizedEmail,
        ...(state?.returnTo ? { returnTo: state.returnTo } : {}),
      });

      return {
        redirectTo: this.googleMfaRedirect(challengeToken),
      };
    }

    await this.upsertOauthAccount(user, {
      provider: "google",
      providerUserId: profile.sub,
      email: normalizedEmail,
      profile: {
        email: normalizedEmail,
        name: profile.name ?? verifiedIdToken.name ?? user.name,
        picture: profile.picture ?? verifiedIdToken.picture ?? null,
      },
    });
    const session = await this.createSessionForUser(user, headers);

    await this.database.db.insert(auditLogs).values({
      tenantId: user.tenantId,
      branchId: access.branchId,
      userId: user.id,
      requestId: requestIdFromHeaders(headers),
      action: "auth.google_login",
      entityType: "user",
      entityId: user.id,
      metadata: {
        email: normalizedEmail,
        googleSub: profile.sub,
      },
    });

    return {
      token: session.token,
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      redirectTo: new URL(
        resolveGoogleRedirectTarget(user.isPlatformUser, state.returnTo),
        this.publicWebUrl(),
      ).toString(),
    };
  }

  async completeGoogleMfa(input: GoogleMfaCompleteInput, headers: HeaderRecord) {
    const challenge = verifyOauthChallenge(input.challengeToken);
    if (!challenge) {
      throw new UnauthorizedException("Invalid Google MFA challenge");
    }

    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.id, challenge.userId), eq(users.isActive, true)))
      .limit(1);

    if (!user?.mfaEnabled || !user.mfaSecretRef) {
      throw new UnauthorizedException("MFA is not configured for this user");
    }

    const accepted = await this.verifyLoginMfaCode({
      tenantId: user.tenantId,
      userId: user.id,
      encryptedSecret: user.mfaSecretRef,
      code: input.code,
    });
    if (!accepted) {
      throw new UnauthorizedException("Invalid MFA code");
    }

    await this.assertTenantCanAccess(user.tenantId, user.isPlatformUser);
    await this.upsertOauthAccount(user, {
      provider: "google",
      providerUserId: challenge.providerUserId,
      email: challenge.email,
      profile: {
        email: challenge.email,
      },
    });

    const session = await this.createSessionForUser(user, headers);
    const access = await this.accessForUser(user.id);
    await this.database.db.insert(auditLogs).values({
      tenantId: user.tenantId,
      branchId: access.branchId,
      userId: user.id,
      requestId: requestIdFromHeaders(headers),
      action: "auth.google_login_mfa_completed",
      entityType: "user",
      entityId: user.id,
      metadata: {
        email: challenge.email,
        googleSub: challenge.providerUserId,
      },
    });

    return {
      token: session.token,
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      redirectTo: new URL(
        resolveGoogleRedirectTarget(user.isPlatformUser, challenge.returnTo),
        this.publicWebUrl(),
      ).toString(),
    };
  }

  async listOauthAccounts(context: TenantContext) {
    if (!context.userId) {
      throw new UnauthorizedException("Invalid session");
    }

    return this.database.db
      .select({
        id: oauthAccounts.id,
        provider: oauthAccounts.provider,
        email: oauthAccounts.email,
        lastLoginAt: oauthAccounts.lastLoginAt,
        createdAt: oauthAccounts.createdAt,
      })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, context.userId))
      .orderBy(oauthAccounts.provider);
  }

  async unlinkGoogleAccount(context: TenantContext) {
    if (!context.userId) {
      throw new UnauthorizedException("Invalid session");
    }

    const [user] = await this.database.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, context.userId))
      .limit(1);
    if (!user?.passwordHash) {
      throw new BadRequestException("Configure uma senha local antes de desvincular o Google");
    }

    const [account] = await this.database.db
      .delete(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, context.userId), eq(oauthAccounts.provider, "google")))
      .returning({
        id: oauthAccounts.id,
        email: oauthAccounts.email,
        providerUserId: oauthAccounts.providerUserId,
      });

    if (!account) {
      throw new NotFoundException("Google account is not linked");
    }

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "auth.google_unlinked",
      entityType: "user",
      entityId: context.userId,
      metadata: {
        email: account.email,
        googleSub: account.providerUserId,
      },
    });

    return { unlinked: true };
  }

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

    await this.assertTenantCanAccess(user.tenantId, user.isPlatformUser);

    const isValid = await verifyPassword(user.passwordHash, input.password);
    if (!isValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const access = await this.accessForUser(user.id);
    if (user.mfaEnabled) {
      if (!user.mfaSecretRef || !input.mfaCode) {
        return {
          token: null,
          maxAgeSeconds: 0,
          mfaRequired: true,
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

      const mfaAccepted = await this.verifyLoginMfaCode({
        tenantId: user.tenantId,
        userId: user.id,
        encryptedSecret: user.mfaSecretRef,
        code: input.mfaCode,
      });
      if (!mfaAccepted) {
        throw new UnauthorizedException("Invalid MFA code");
      }
    }

    const session = await this.createSessionForUser(user, headers);

    return {
      token: session.token,
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      mfaRequired: false,
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

  async startTrial(input: StartTrialInput, headers: HeaderRecord) {
    assertStrongPassword(input.password);
    const normalizedEmail = input.ownerEmail.toLowerCase();
    const slug = slugify(input.establishmentName);
    if (!slug) {
      throw new BadRequestException("Nome do estabelecimento inválido");
    }

    const requestId = requestIdFromHeaders(headers);
    const trial = createTrialWindow();

    const created = await this.database.db.transaction(async (tx) => {
      const [existingTenant] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      if (existingTenant) {
        throw new BadRequestException("Já existe um ambiente GiroMesa com esse nome");
      }

      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);
      if (existingUser) {
        throw new BadRequestException("Este e-mail já possui acesso ao GiroMesa");
      }

      const planDefinition = planCatalog[input.planCode];
      const [plan] = await tx
        .insert(plans)
        .values({
          code: input.planCode,
          name: planDefinition.name,
          priceCents: planDefinition.priceCents,
          limits: planDefinition.limits,
        })
        .onConflictDoUpdate({
          target: plans.code,
          set: {
            name: planDefinition.name,
            priceCents: planDefinition.priceCents,
            limits: planDefinition.limits,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!plan) {
        throw new Error("Failed to resolve plan");
      }

      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.establishmentName.trim(),
          slug,
          document: input.document?.trim() || null,
          status: "trial",
          settings: {
            onboardingStatus: "trial_started",
            trial: {
              source: "public_signup",
              startedAt: trial.startsAt.toISOString(),
              endsAt: trial.endsAt.toISOString(),
              trialDays: TRIAL_DAYS,
              cardRequired: false,
            },
            commercial: {
              ownerPhone: input.phone?.trim() || null,
              acquisitionChannel: "website",
            },
          },
        })
        .returning();
      if (!tenant) {
        throw new Error("Failed to create tenant");
      }

      const [branch] = await tx
        .insert(branches)
        .values({
          tenantId: tenant.id,
          name: input.branchName.trim() || "Matriz",
          document: input.document?.trim() || null,
        })
        .returning();

      const [ownerRole] = await tx
        .insert(roles)
        .values({
          tenantId: tenant.id,
          code: "owner",
          name: "Proprietário",
          permissions: [
            "tenant:manage",
            "catalog:manage",
            "pos:operate",
            "pos:qr_review",
            "pos:kds_send",
            "pos:payment_manage",
            "pos:close_order",
            "kds:operate",
            "cash:manage",
            "fiscal:read",
            "fiscal:manage",
            "hardware:manage",
            "print:operate",
            "inventory:manage",
            "reports:read",
          ],
        })
        .returning();

      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: normalizedEmail,
          name: input.ownerName.trim(),
          passwordHash: await hashPassword(input.password),
        })
        .returning();

      if (!branch || !ownerRole || !owner) {
        throw new Error("Failed to create trial bootstrap data");
      }

      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          tenantId: tenant.id,
          planId: plan.id,
          provider: "asaas",
          status: "trial",
          currentPeriodEndsAt: trial.endsAt,
        })
        .returning();
      if (!subscription) {
        throw new Error("Failed to create trial subscription");
      }

      await tx.insert(userRoles).values({
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRole.id,
        branchId: branch.id,
      });

      await tx.insert(auditLogs).values({
        tenantId: tenant.id,
        branchId: branch.id,
        userId: owner.id,
        requestId,
        action: "auth.trial_started",
        entityType: "tenant",
        entityId: tenant.id,
        metadata: {
          ownerEmail: owner.email,
          planCode: plan.code,
          trialDays: TRIAL_DAYS,
          cardRequired: false,
          currentPeriodEndsAt: trial.endsAt.toISOString(),
        },
      });

      return {
        owner,
        tenant,
        subscription,
      };
    });

    const session = await this.createSessionForUser(created.owner, headers);
    const access = await this.accessForUser(created.owner.id);

    return {
      token: session.token,
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      user: {
        id: created.owner.id,
        tenantId: created.owner.tenantId,
        email: created.owner.email,
        name: created.owner.name,
        isPlatformUser: created.owner.isPlatformUser,
        permissions: access.permissions,
      } satisfies SessionUser,
      tenant: {
        id: created.tenant.id,
        name: created.tenant.name,
        slug: created.tenant.slug,
        status: created.tenant.status,
      },
      subscription: {
        status: created.subscription.status,
        trialDays: TRIAL_DAYS,
        currentPeriodEndsAt: created.subscription.currentPeriodEndsAt,
      },
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
        mfaEnabled: users.mfaEnabled,
        tenantStatus: tenants.status,
        currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(tenants, eq(tenants.id, sessions.tenantId))
      .leftJoin(subscriptions, eq(subscriptions.tenantId, sessions.tenantId))
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
    this.assertTenantStatusCanAccess(session.tenantStatus, session.isPlatformUser);

    return {
      tenantId: session.tenantId ?? "platform",
      userId: session.userId,
      requestId,
      permissions: access.permissions,
      mfaRequired: this.isMfaRecommended(access.permissions, session.mfaEnabled),
      billing: {
        status: billingStatusForTenant(session.tenantStatus, session.currentPeriodEndsAt),
        tenantStatus: session.tenantStatus,
        currentPeriodEndsAt: session.currentPeriodEndsAt?.toISOString() ?? null,
        trialDaysRemaining: trialDaysRemaining(session.currentPeriodEndsAt),
      },
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

  async listRoles(context: TenantContext) {
    return this.database.db
      .select({
        id: roles.id,
        code: roles.code,
        name: roles.name,
        permissions: roles.permissions,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
      })
      .from(roles)
      .where(eq(roles.tenantId, context.tenantId))
      .orderBy(roles.name);
  }

  async updateRole(context: TenantContext, roleId: string, input: UpdateRoleInput) {
    return this.database.db.transaction(async (tx) => {
      const [currentRole] = await tx
        .select()
        .from(roles)
        .where(and(eq(roles.tenantId, context.tenantId), eq(roles.id, roleId)))
        .limit(1);

      if (!currentRole) {
        throw new NotFoundException("Role not found");
      }

      const nextPermissions =
        input.permissions === undefined
          ? currentRole.permissions
          : [...new Set(input.permissions.map((permission) => permission.trim()).filter(Boolean))];
      const nextName = input.name?.trim() || currentRole.name;

      const [updatedRole] = await tx
        .update(roles)
        .set({
          name: nextName,
          permissions: nextPermissions,
          updatedAt: new Date(),
        })
        .where(and(eq(roles.tenantId, context.tenantId), eq(roles.id, roleId)))
        .returning({
          id: roles.id,
          code: roles.code,
          name: roles.name,
          permissions: roles.permissions,
          createdAt: roles.createdAt,
          updatedAt: roles.updatedAt,
        });

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: context.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "role.updated",
        entityType: "role",
        entityId: currentRole.id,
        metadata: {
          code: currentRole.code,
          previousName: currentRole.name,
          nextName,
          previousPermissions: currentRole.permissions,
          nextPermissions,
        },
      });

      if (!updatedRole) {
        throw new Error("Failed to update role");
      }

      return updatedRole;
    });
  }

  async listUsers(context: TenantContext) {
    const rows = await this.database.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isActive: users.isActive,
        mfaEnabled: users.mfaEnabled,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
        branchId: userRoles.branchId,
      })
      .from(users)
      .leftJoin(
        userRoles,
        and(eq(userRoles.tenantId, context.tenantId), eq(userRoles.userId, users.id)),
      )
      .leftJoin(roles, and(eq(roles.tenantId, context.tenantId), eq(roles.id, userRoles.roleId)))
      .where(eq(users.tenantId, context.tenantId))
      .orderBy(users.name);

    const usersById = new Map<
      string,
      {
        id: string;
        email: string;
        name: string;
        isActive: boolean;
        mfaEnabled: boolean;
        lastLoginAt: Date | null;
        createdAt: Date;
        roles: Array<{
          id: string;
          code: string;
          name: string;
          branchId: string | null;
        }>;
      }
    >();

    for (const row of rows) {
      const current = usersById.get(row.id) ?? {
        id: row.id,
        email: row.email,
        name: row.name,
        isActive: row.isActive,
        mfaEnabled: row.mfaEnabled,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
        roles: [],
      };

      if (row.roleId && row.roleCode && row.roleName) {
        current.roles.push({
          id: row.roleId,
          code: row.roleCode,
          name: row.roleName,
          branchId: row.branchId,
        });
      }

      usersById.set(row.id, current);
    }

    return [...usersById.values()];
  }

  async listInvitations(context: TenantContext) {
    const rows = await this.database.db
      .select({
        id: invitations.id,
        email: invitations.email,
        roleId: invitations.roleId,
        roleCode: roles.code,
        roleName: roles.name,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .leftJoin(roles, and(eq(roles.tenantId, context.tenantId), eq(roles.id, invitations.roleId)))
      .where(eq(invitations.tenantId, context.tenantId))
      .orderBy(desc(invitations.createdAt))
      .limit(20);

    return rows.map((row) => ({
      ...row,
      status: row.acceptedAt ? "accepted" : row.expiresAt < new Date() ? "expired" : "pending",
    }));
  }

  async createInvitation(context: TenantContext, input: CreateInvitationInput) {
    const role = await this.resolveRole(context, input);
    const { token, tokenHash } = createSessionToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    const [invitation] = await this.database.db
      .insert(invitations)
      .values({
        tenantId: context.tenantId,
        email: input.email.toLowerCase(),
        roleId: role?.id,
        tokenHash,
        expiresAt,
      })
      .returning();

    if (!invitation) {
      throw new Error("Failed to create invitation");
    }

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId ?? context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: {
        email: invitation.email,
        roleId: role?.id ?? null,
        roleCode: role?.code ?? null,
        delivery: "email_provider_mock",
      },
    });

    const acceptUrl = this.publicAppUrl(`/invite/${token}`);
    const branding = await this.emailBranding(context.tenantId);
    const emailDelivery = await createEmailProvider().send({
      tenantId: context.tenantId,
      to: invitation.email,
      subject: `Convite para acessar ${branding.displayName}`,
      text: `Voce foi convidado para acessar ${branding.displayName} no GiroMesa. Abra: ${acceptUrl}`,
      html: renderBrandedEmail({
        branding,
        title: `Convite para ${branding.displayName}`,
        body: "Voce foi convidado para acessar o ambiente operacional do estabelecimento.",
        actionLabel: "Aceitar convite",
        actionUrl: acceptUrl,
      }),
    });

    return {
      id: invitation.id,
      tenantId: invitation.tenantId,
      email: invitation.email,
      roleId: role?.id ?? null,
      roleCode: role?.code ?? null,
      roleName: role?.name ?? null,
      expiresAt: invitation.expiresAt,
      status: "pending",
      delivery: emailDelivery.provider,
      acceptUrl,
      tokenReturnedOnce: token,
    };
  }

  async resendInvitation(context: TenantContext, invitationId: string) {
    const { token, tokenHash } = createSessionToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const [invitation] = await this.database.db
      .update(invitations)
      .set({ tokenHash, expiresAt, acceptedAt: null, updatedAt: new Date() })
      .where(and(eq(invitations.tenantId, context.tenantId), eq(invitations.id, invitationId)))
      .returning();

    if (!invitation) {
      throw new NotFoundException("Invitation not found");
    }

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "invitation.resent",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { email: invitation.email, delivery: "email_provider_mock" },
    });

    const acceptUrl = this.publicAppUrl(`/invite/${token}`);
    const branding = await this.emailBranding(context.tenantId);
    const emailDelivery = await createEmailProvider().send({
      tenantId: context.tenantId,
      to: invitation.email,
      subject: `Novo convite para ${branding.displayName}`,
      text: `Seu novo link de convite para ${branding.displayName}: ${acceptUrl}`,
      html: renderBrandedEmail({
        branding,
        title: `Novo convite para ${branding.displayName}`,
        body: "Seu link temporario foi renovado.",
        actionLabel: "Aceitar convite",
        actionUrl: acceptUrl,
      }),
    });

    return {
      id: invitation.id,
      email: invitation.email,
      roleId: invitation.roleId,
      expiresAt: invitation.expiresAt,
      status: "pending",
      delivery: emailDelivery.provider,
      acceptUrl,
      tokenReturnedOnce: token,
    };
  }

  async cancelInvitation(context: TenantContext, invitationId: string) {
    const [invitation] = await this.database.db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000), updatedAt: new Date() })
      .where(
        and(
          eq(invitations.tenantId, context.tenantId),
          eq(invitations.id, invitationId),
          isNull(invitations.acceptedAt),
        ),
      )
      .returning();

    if (!invitation) {
      throw new NotFoundException("Invitation not found");
    }

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "invitation.canceled",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { email: invitation.email },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      roleId: invitation.roleId,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      status: "expired",
    };
  }

  async acceptInvitation(input: AcceptInvitationInput, headers: HeaderRecord) {
    assertStrongPassword(input.password);
    const tokenHash = hashOpaqueToken(input.token);
    const [invitation] = await this.database.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, tokenHash),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invitation) {
      throw new UnauthorizedException("Invalid invitation");
    }

    const passwordHash = await hashPassword(input.password);
    const normalizedEmail = invitation.email.toLowerCase();
    const name = input.name?.trim() || normalizedEmail.split("@")[0] || "Novo usuario";

    const session = await this.database.db.transaction(async (tx) => {
      const [existingUser] = await tx
        .select()
        .from(users)
        .where(and(eq(users.tenantId, invitation.tenantId), eq(users.email, normalizedEmail)))
        .limit(1);

      const [user] = existingUser
        ? await tx
            .update(users)
            .set({ name, passwordHash, isActive: true, updatedAt: new Date() })
            .where(eq(users.id, existingUser.id))
            .returning()
        : await tx
            .insert(users)
            .values({
              tenantId: invitation.tenantId,
              email: normalizedEmail,
              name,
              passwordHash,
              isActive: true,
            })
            .returning();

      if (!user) {
        throw new Error("Failed to accept invitation");
      }

      if (invitation.roleId) {
        const [existingRole] = await tx
          .select()
          .from(userRoles)
          .where(and(eq(userRoles.tenantId, invitation.tenantId), eq(userRoles.userId, user.id)))
          .limit(1);

        if (existingRole) {
          await tx
            .update(userRoles)
            .set({ roleId: invitation.roleId, updatedAt: new Date() })
            .where(eq(userRoles.id, existingRole.id));
        } else {
          await tx.insert(userRoles).values({
            tenantId: invitation.tenantId,
            userId: user.id,
            roleId: invitation.roleId,
          });
        }
      }

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      await tx.insert(auditLogs).values({
        tenantId: invitation.tenantId,
        userId: user.id,
        requestId: requestIdFromHeaders(headers),
        action: "invitation.accepted",
        entityType: "invitation",
        entityId: invitation.id,
        metadata: {
          email: normalizedEmail,
          roleId: invitation.roleId,
        },
      });

      const { token, tokenHash: sessionTokenHash } = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
      await tx.insert(sessions).values({
        tenantId: invitation.tenantId,
        userId: user.id,
        tokenHash: sessionTokenHash,
        userAgent: Array.isArray(headers["user-agent"])
          ? headers["user-agent"][0]
          : headers["user-agent"],
        ipAddress: Array.isArray(headers["x-forwarded-for"])
          ? headers["x-forwarded-for"][0]
          : headers["x-forwarded-for"],
        expiresAt,
      });

      return { token, user };
    });

    const access = await this.accessForUser(session.user.id);
    return {
      token: session.token,
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      user: {
        id: session.user.id,
        tenantId: session.user.tenantId,
        email: session.user.email,
        name: session.user.name,
        isPlatformUser: session.user.isPlatformUser,
        permissions: access.permissions,
      } satisfies SessionUser,
    };
  }

  async assignUserRole(context: TenantContext, userId: string, input: AssignUserRoleInput) {
    return this.database.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, context.tenantId), eq(users.id, userId)))
        .limit(1);

      if (!user) {
        throw new NotFoundException("User not found");
      }

      const [role] = await tx
        .select({ id: roles.id, code: roles.code, name: roles.name })
        .from(roles)
        .where(and(eq(roles.tenantId, context.tenantId), eq(roles.id, input.roleId)))
        .limit(1);

      if (!role) {
        throw new NotFoundException("Role not found");
      }

      const [existing] = await tx
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.tenantId, context.tenantId), eq(userRoles.userId, userId)))
        .limit(1);

      if (existing) {
        await tx
          .update(userRoles)
          .set({ roleId: role.id, branchId: input.branchId, updatedAt: new Date() })
          .where(eq(userRoles.id, existing.id));
      } else {
        await tx.insert(userRoles).values({
          tenantId: context.tenantId,
          userId,
          roleId: role.id,
          branchId: input.branchId,
        });
      }

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: input.branchId ?? context.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "user.role_assigned",
        entityType: "user",
        entityId: user.id,
        metadata: {
          email: user.email,
          previousRoleId: existing?.roleId ?? null,
          nextRoleId: role.id,
          nextRoleCode: role.code,
        },
      });

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        role,
      };
    });
  }

  async changePassword(context: TenantContext, input: ChangePasswordInput) {
    assertStrongPassword(input.newPassword);
    if (!context.userId) {
      throw new UnauthorizedException("Invalid session");
    }

    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)))
      .limit(1);

    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const currentPasswordMatches = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!currentPasswordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.database.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
      .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)));

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "password.changed",
      entityType: "user",
      entityId: context.userId,
      metadata: {},
    });

    return { changed: true };
  }

  async requestPasswordReset(input: { email: string }, headers: HeaderRecord) {
    const [user] = await this.database.db
      .select({ id: users.id, tenantId: users.tenantId, email: users.email })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    let token: string | undefined;
    if (user?.tenantId) {
      const issuedToken = createSessionToken();
      token = issuedToken.token;
      await this.database.db.insert(passwordResetTokens).values({
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: issuedToken.tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      });

      await this.database.db.insert(auditLogs).values({
        tenantId: user.tenantId,
        userId: user.id,
        requestId: requestIdFromHeaders(headers),
        action: "password.reset_requested",
        entityType: "user",
        entityId: user.id,
        metadata: { email: user.email, delivery: "email_provider_mock" },
      });

      const resetUrl = this.publicAppUrl(`/reset/${token}`);
      const branding = await this.emailBranding(user.tenantId);
      await createEmailProvider().send({
        tenantId: user.tenantId,
        to: user.email,
        subject: `Reset de senha - ${branding.displayName}`,
        text: `Use este link temporario para redefinir sua senha em ${branding.displayName}: ${resetUrl}`,
        html: renderBrandedEmail({
          branding,
          title: "Redefinir senha",
          body: `Use este link temporario para recuperar seu acesso ao ambiente ${branding.displayName}.`,
          actionLabel: "Redefinir senha",
          actionUrl: resetUrl,
        }),
      });
    }

    return {
      requested: true,
      delivery: "email_provider_mock",
      ...(token
        ? { resetUrl: this.publicAppUrl(`/reset/${token}`), tokenReturnedOnce: token }
        : {}),
    };
  }

  async resetPassword(input: ResetPasswordInput, headers: HeaderRecord) {
    assertStrongPassword(input.password);
    const tokenHash = hashOpaqueToken(input.token);
    const [resetToken] = await this.database.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!resetToken) {
      throw new UnauthorizedException("Invalid reset token");
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() })
        .where(and(eq(users.tenantId, resetToken.tenantId), eq(users.id, resetToken.userId)));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date(), updatedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));
      await tx.insert(auditLogs).values({
        tenantId: resetToken.tenantId,
        userId: resetToken.userId,
        requestId: requestIdFromHeaders(headers),
        action: "password.reset_completed",
        entityType: "user",
        entityId: resetToken.userId,
        metadata: {},
      });
    });

    return { reset: true };
  }

  async configureMfa(context: TenantContext, enabled: boolean) {
    if (!context.userId) {
      throw new UnauthorizedException("Invalid session");
    }

    if (enabled) {
      throw new BadRequestException("Use MFA setup and verification before enabling MFA");
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(mfaRecoveryCodes)
        .where(
          and(
            eq(mfaRecoveryCodes.tenantId, context.tenantId),
            eq(mfaRecoveryCodes.userId, context.userId ?? ""),
          ),
        );
      await tx
        .update(users)
        .set({
          mfaEnabled: false,
          mfaSecretRef: null,
          updatedAt: new Date(),
        })
        .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId ?? "")));
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: context.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "mfa.disabled",
        entityType: "user",
        entityId: context.userId,
        metadata: { provider: "totp" },
      });
    });

    return { enabled: false, provider: "totp" };
  }

  async setupMfa(context: TenantContext) {
    if (!context.userId) {
      throw new UnauthorizedException("Invalid session");
    }

    const [user] = await this.database.db
      .select({ id: users.id, email: users.email, mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException("Invalid session");
    }

    const secret = generateTotpSecret();
    const encryptedSecret = encryptSecret(secret);
    await this.database.db
      .update(users)
      .set({ mfaSecretRef: encryptedSecret, mfaEnabled: false, updatedAt: new Date() })
      .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)));

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "mfa.setup_started",
      entityType: "user",
      entityId: context.userId,
      metadata: { provider: "totp" },
    });

    const otpauthUrl = createOtpAuthUrl({
      issuer: MFA_ISSUER,
      accountName: user.email,
      secret,
    });

    return {
      enabled: false,
      provider: "totp",
      manualKey: secret,
      otpauthUrl,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }),
    };
  }

  async verifyMfaSetup(context: TenantContext, code: string) {
    if (!context.userId) {
      throw new UnauthorizedException("Invalid session");
    }

    const [user] = await this.database.db
      .select({ id: users.id, mfaSecretRef: users.mfaSecretRef })
      .from(users)
      .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)))
      .limit(1);

    if (!user?.mfaSecretRef || !verifyTotpCode(decryptSecret(user.mfaSecretRef), code)) {
      throw new UnauthorizedException("Invalid MFA code");
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(mfaRecoveryCodes)
        .where(
          and(
            eq(mfaRecoveryCodes.tenantId, context.tenantId),
            eq(mfaRecoveryCodes.userId, context.userId ?? ""),
          ),
        );
      await tx
        .update(users)
        .set({ mfaEnabled: true, updatedAt: new Date() })
        .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId ?? "")));
      await tx.insert(mfaRecoveryCodes).values(
        recoveryCodes.map((recoveryCode) => ({
          tenantId: context.tenantId,
          userId: context.userId ?? "",
          codeHash: hashRecoveryCode(recoveryCode),
        })),
      );
    });

    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "mfa.enabled",
      entityType: "user",
      entityId: context.userId,
      metadata: { provider: "totp" },
    });

    return { enabled: true, provider: "totp", recoveryCodes };
  }

  async regenerateRecoveryCodes(context: TenantContext, code: string) {
    if (!context.userId) {
      throw new UnauthorizedException("Invalid session");
    }

    const [user] = await this.database.db
      .select({ id: users.id, mfaSecretRef: users.mfaSecretRef, mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(and(eq(users.tenantId, context.tenantId), eq(users.id, context.userId)))
      .limit(1);

    if (
      !user?.mfaEnabled ||
      !user.mfaSecretRef ||
      !verifyTotpCode(decryptSecret(user.mfaSecretRef), code)
    ) {
      throw new UnauthorizedException("Invalid MFA code");
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(mfaRecoveryCodes)
        .where(
          and(
            eq(mfaRecoveryCodes.tenantId, context.tenantId),
            eq(mfaRecoveryCodes.userId, context.userId ?? ""),
          ),
        );
      await tx.insert(mfaRecoveryCodes).values(
        recoveryCodes.map((recoveryCode) => ({
          tenantId: context.tenantId,
          userId: context.userId ?? "",
          codeHash: hashRecoveryCode(recoveryCode),
        })),
      );
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: context.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "mfa.recovery_codes_regenerated",
        entityType: "user",
        entityId: context.userId,
        metadata: { count: recoveryCodes.length },
      });
    });

    return { recoveryCodes };
  }

  private async verifyLoginMfaCode(input: {
    tenantId: string | null;
    userId: string;
    encryptedSecret: string;
    code: string;
  }) {
    const secret = decryptSecret(input.encryptedSecret);
    if (verifyTotpCode(secret, input.code)) {
      return true;
    }

    if (!input.tenantId) {
      return false;
    }

    const normalizedCode = normalizeRecoveryCode(input.code);
    if (!normalizedCode) {
      return false;
    }

    const [recoveryCode] = await this.database.db
      .select({ id: mfaRecoveryCodes.id })
      .from(mfaRecoveryCodes)
      .where(
        and(
          eq(mfaRecoveryCodes.tenantId, input.tenantId),
          eq(mfaRecoveryCodes.userId, input.userId),
          eq(mfaRecoveryCodes.codeHash, hashRecoveryCode(normalizedCode)),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      )
      .limit(1);

    if (!recoveryCode) {
      return false;
    }

    await this.database.db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date(), updatedAt: new Date() })
      .where(eq(mfaRecoveryCodes.id, recoveryCode.id));
    return true;
  }

  private publicAppUrl(path: string) {
    const baseUrl = process.env.APP_URL ?? "http://localhost:3002";
    return new URL(path, baseUrl).toString();
  }

  private publicWebUrl() {
    return process.env.PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3002";
  }

  private googleRedirectUri() {
    return (
      process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${loadEnv().API_URL}/api/v1/auth/google/callback`
    );
  }

  private async createSessionForUser(
    user: { id: string; tenantId: string | null },
    headers: HeaderRecord,
  ) {
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

    await this.database.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return { token };
  }

  private async findOauthAccount(provider: string, providerUserId: string) {
    const [account] = await this.database.db
      .select({
        id: oauthAccounts.id,
        userId: oauthAccounts.userId,
        tenantId: oauthAccounts.tenantId,
      })
      .from(oauthAccounts)
      .where(
        and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, providerUserId)),
      )
      .limit(1);

    return account;
  }

  private async upsertOauthAccount(
    user: { id: string; tenantId: string | null },
    input: {
      provider: "google";
      providerUserId: string;
      email: string;
      profile: Record<string, unknown>;
    },
  ) {
    const existingByProviderUser = await this.findOauthAccount(
      input.provider,
      input.providerUserId,
    );
    if (existingByProviderUser && existingByProviderUser.userId !== user.id) {
      throw new UnauthorizedException("Google account is already linked to another user");
    }

    await this.database.db
      .insert(oauthAccounts)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        provider: input.provider,
        providerUserId: input.providerUserId,
        email: input.email,
        profile: input.profile,
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [oauthAccounts.userId, oauthAccounts.provider],
        set: {
          providerUserId: input.providerUserId,
          email: input.email,
          profile: input.profile,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  private async accessForUser(userId: string) {
    const [user] = await this.database.db
      .select({ isPlatformUser: users.isPlatformUser })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.isPlatformUser) {
      return {
        permissions: ["platform:read", "platform:manage"],
        branchId: undefined,
      };
    }

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

  private async assertTenantCanAccess(tenantId: string | null, isPlatformUser: boolean) {
    if (!tenantId || isPlatformUser) {
      return;
    }

    const [tenant] = await this.database.db
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    this.assertTenantStatusCanAccess(tenant?.status, isPlatformUser);
  }

  private assertTenantStatusCanAccess(
    status: "trial" | "active" | "past_due" | "suspended" | "canceled" | null | undefined,
    isPlatformUser: boolean,
  ) {
    if (isPlatformUser || !status) {
      return;
    }

    if (status === "suspended" || status === "canceled") {
      throw new UnauthorizedException("Tenant access is suspended");
    }
  }

  private isMfaRecommended(permissions: string[], enabled: boolean) {
    if (enabled) {
      return false;
    }
    return permissions.some((permission) =>
      ["tenant:manage", "fiscal:manage", "reports:read"].includes(permission),
    );
  }

  private async emailBranding(tenantId: string | null): Promise<DocumentBranding> {
    if (!tenantId) {
      return { displayName: "GiroMesa", logoUrl: null, accentPreset: "emerald" };
    }

    const [tenant] = await this.database.db
      .select({ name: tenants.name, settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return readEmailBranding(tenant?.settings, tenant?.name ?? "GiroMesa");
  }

  private async resolveRole(context: TenantContext, input: CreateInvitationInput) {
    if (!input.roleId && !input.roleCode) {
      return null;
    }

    const filters = [
      eq(roles.tenantId, context.tenantId),
      input.roleId ? eq(roles.id, input.roleId) : eq(roles.code, input.roleCode ?? ""),
    ];

    const [role] = await this.database.db
      .select({ id: roles.id, code: roles.code, name: roles.name })
      .from(roles)
      .where(and(...filters))
      .limit(1);

    if (!role) {
      throw new NotFoundException("Role not found");
    }

    return role;
  }
}

function assertStrongPassword(password: string) {
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSymbol) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readEmailBranding(settings: Record<string, unknown> | undefined, fallbackName: string) {
  const rawBranding =
    settings && typeof settings.branding === "object" && settings.branding !== null
      ? (settings.branding as Record<string, unknown>)
      : {};
  const accentPreset = typeof rawBranding.accentPreset === "string" ? rawBranding.accentPreset : "";

  return {
    displayName:
      typeof rawBranding.displayName === "string" && rawBranding.displayName.trim()
        ? rawBranding.displayName.trim()
        : fallbackName,
    logoUrl:
      typeof rawBranding.logoUrl === "string" && rawBranding.logoUrl.length > 0
        ? rawBranding.logoUrl
        : null,
    accentPreset:
      accentPreset === "blue" ||
      accentPreset === "amber" ||
      accentPreset === "rose" ||
      accentPreset === "violet"
        ? accentPreset
        : "emerald",
  } satisfies DocumentBranding;
}

function sanitizeReturnTo(returnTo: string | undefined) {
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) {
    return undefined;
  }
  return returnTo;
}

function resolveGoogleRedirectTarget(isPlatformUser: boolean, returnTo: string | undefined) {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (isPlatformUser) {
    return safeReturnTo?.startsWith("/platform") ? safeReturnTo : "/platform";
  }
  return safeReturnTo?.startsWith("/app") ? safeReturnTo : "/app";
}
