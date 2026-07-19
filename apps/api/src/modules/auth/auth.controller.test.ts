import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RateLimitService } from "../../common/rate-limit";
import { AuthController } from "./auth.controller";

function createReply() {
  return {
    headers: [] as Array<[string, string]>,
    redirectUrl: "" as string,
    header(key: string, value: string) {
      this.headers.push([key, value]);
      return this;
    },
    redirect(url: string) {
      this.redirectUrl = url;
      return { redirected: true, url };
    },
  };
}

function createController() {
  const authService = {
    resolveContext: vi.fn(async () => ({
      tenantId: "tenant-1",
      userId: "user-1",
      requestId: "req-1",
      permissions: ["tenant:manage"],
    })),
    googleAuthorizationUrl: vi.fn(
      (input?: unknown) => `https://accounts.google.com/mock?${JSON.stringify(input ?? {})}`,
    ),
    googleFailureRedirect: vi.fn((reason: string) => `http://localhost:3002/login?oauth=${reason}`),
    completeGoogleLogin: vi.fn(async () => ({
      token: "token-123",
      maxAgeSeconds: 28800,
      redirectTo: "http://localhost:3002/app",
    })),
    completeGoogleMfa: vi.fn(async () => ({
      token: "token-456",
      maxAgeSeconds: 28800,
      redirectTo: "http://localhost:3002/platform",
    })),
    listOauthAccounts: vi.fn(async () => []),
    unlinkGoogleAccount: vi.fn(async () => ({ unlinked: true })),
  };

  return {
    controller: new AuthController(authService as never, new RateLimitService()),
    authService,
  };
}

describe("AuthController Google OAuth", () => {
  it("starts google login flow", async () => {
    const { controller, authService } = createController();
    const reply = createReply();

    await controller.googleStart({ returnTo: "/app", mode: "login" }, {}, reply as never);

    expect(authService.googleAuthorizationUrl).toHaveBeenCalledWith({
      mode: "login",
      returnTo: "/app",
    });
    expect(reply.redirectUrl).toContain("accounts.google.com/mock");
  });

  it("starts google link flow with authenticated user", async () => {
    const { controller, authService } = createController();
    const reply = createReply();

    await controller.googleStart({ returnTo: "/app/security", mode: "link" }, {}, reply as never);

    expect(authService.resolveContext).toHaveBeenCalled();
    expect(authService.googleAuthorizationUrl).toHaveBeenCalledWith({
      mode: "link",
      userId: "user-1",
      returnTo: "/app/security",
    });
  });

  it("completes google callback and sets session cookie", async () => {
    const { controller, authService } = createController();
    const reply = createReply();

    await controller.googleCallback({ code: "abc", state: "state" }, reply as never, {});

    expect(authService.completeGoogleLogin).toHaveBeenCalledWith(
      { code: "abc", state: "state" },
      {},
    );
    expect(reply.headers.some(([key]) => key === "set-cookie")).toBe(true);
    expect(reply.redirectUrl).toBe("http://localhost:3002/app");
  });

  it("redirects to failure url when google callback fails", async () => {
    const { controller, authService } = createController();
    const reply = createReply();
    authService.completeGoogleLogin = vi.fn(async () => {
      throw new UnauthorizedException("bad");
    });

    await controller.googleCallback({ code: "abc", state: "state" }, reply as never, {});

    expect(authService.googleFailureRedirect).toHaveBeenCalledWith("google_sign_in_failed");
    expect(reply.redirectUrl).toContain("oauth=google_sign_in_failed");
  });

  it("completes google mfa flow and sets session cookie", async () => {
    const { controller, authService } = createController();
    const reply = createReply();

    const result = await controller.completeGoogleMfa(
      { challengeToken: "challenge-token-challenge-token", code: "123456" },
      {},
      reply as never,
    );

    expect(authService.completeGoogleMfa).toHaveBeenCalledWith(
      { challengeToken: "challenge-token-challenge-token", code: "123456" },
      {},
    );
    expect(reply.headers.some(([key]) => key === "set-cookie")).toBe(true);
    expect(result.redirectTo).toBe("http://localhost:3002/platform");
  });

  it("lists linked oauth accounts for current session", async () => {
    const { controller, authService } = createController();

    await controller.listOauthAccounts({});

    expect(authService.listOauthAccounts).toHaveBeenCalled();
  });

  it("unlinks google account for current session", async () => {
    const { controller, authService } = createController();

    const result = await controller.unlinkGoogleAccount({});

    expect(authService.unlinkGoogleAccount).toHaveBeenCalled();
    expect(result.unlinked).toBe(true);
  });
});
