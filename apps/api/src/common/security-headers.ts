import { cspHeader } from "./csp";

export function securityHeaders(): Readonly<Record<string, string>> {
  const csp = cspHeader();

  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
    [csp.key]: csp.value,
  };
}

export function corsOrigin(nodeEnv: string, appUrl: string): true | string[] {
  return nodeEnv === "production" ? [appUrl] : true;
}

type OnSendRegistrar = {
  addHook(
    name: "onSend",
    handler: (
      request: unknown,
      reply: { header(key: string, value: string): void },
      payload: unknown,
    ) => Promise<unknown>,
  ): void;
};

export function registerSecurityHeaders(fastify: OnSendRegistrar) {
  fastify.addHook("onSend", async (_request, reply, payload) => {
    for (const [key, value] of Object.entries(securityHeaders())) {
      reply.header(key, value);
    }
    return payload;
  });
}
