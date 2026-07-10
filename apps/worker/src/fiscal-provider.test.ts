import type { AppEnv } from "@giromesa/config";
import { describe, expect, it } from "vitest";
import { FocusNfeProvider, NuvemFiscalProvider } from "./fiscal-provider";

const env: AppEnv = {
  NODE_ENV: "test",
  APP_NAME: "GiroMesa",
  APP_URL: "http://localhost:3002",
  PUBLIC_APP_URL: "http://localhost:3002",
  API_URL: "http://localhost:3333",
  DATABASE_URL: "postgres://giromesa:giromesa@localhost:55432/giromesa",
  REDIS_URL: "redis://localhost:6380",
  SESSION_SECRET: "local-development-session-secret",
  PASSWORD_PEPPER: "local-development-password-pepper",
  MFA_ISSUER: "GiroMesa",
  MFA_SECRET_ENCRYPTION_KEY: "local-development-mfa-secret-key",
  ASAAS_ENV: "sandbox",
  ASAAS_SANDBOX_URL: "https://api-sandbox.asaas.com/v3",
  ASAAS_PRODUCTION_URL: "https://api.asaas.com/v3",
  FISCAL_PROVIDER: "focus_nfe",
  NUVEM_FISCAL_CLIENT_ID: "client-id",
  NUVEM_FISCAL_CLIENT_SECRET: "client-secret",
  NUVEM_FISCAL_AUTH_URL: "https://auth.nuvemfiscal.com.br/oauth/token",
  NUVEM_FISCAL_SANDBOX_URL: "https://api.sandbox.nuvemfiscal.com.br",
  NUVEM_FISCAL_PRODUCTION_URL: "https://api.nuvemfiscal.com.br",
  NUVEM_FISCAL_SCOPE: "empresa nfce nfe nfse",
  FOCUS_NFE_TOKEN: "focus-token",
  FOCUS_NFE_HOMOLOGATION_URL: "https://homologacao.focusnfe.com.br",
  FOCUS_NFE_PRODUCTION_URL: "https://api.focusnfe.com.br",
  EMAIL_PROVIDER: "smtp",
  SMTP_SECURE: "false",
  LOG_LEVEL: "info",
};

describe("FocusNfeProvider", () => {
  it("emits NFC-e through Focus NFe homologation using Basic Auth and ref", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });

      return new Response(
        JSON.stringify({
          status: "autorizado",
          chave_nfe: "35260600000000000191650010000000011000000010",
          caminho_xml_nota_fiscal: "https://focus.example/nfce.xml",
          caminho_danfe: "https://focus.example/danfe.pdf",
        }),
        { status: 201 },
      );
    };

    const provider = new FocusNfeProvider(env, fetcher);
    const result = await provider.issueConsumerInvoice({
      tenantId: "tenant",
      orderId: "order",
      fiscalDocumentId: "document-001",
      model: "nfce",
      environment: "homologation",
      payload: {
        focusNfePayload: {
          cnpj_emitente: "00000000000191",
          items: [],
          formas_pagamento: [],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe("document001");
    expect(result.data?.accessKey).toBe("35260600000000000191650010000000011000000010");
    expect(calls[0]?.url).toBe(
      "https://homologacao.focusnfe.com.br/v2/nfce?ref=document001&completa=1",
    );
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("focus-token:").toString("base64")}`,
    });
  });

  it("fails without Focus NFe token", async () => {
    const { FOCUS_NFE_TOKEN, ...envWithoutCredentials } = env;
    void FOCUS_NFE_TOKEN;

    const provider = new FocusNfeProvider(envWithoutCredentials);
    const result = await provider.issueConsumerInvoice({
      tenantId: "tenant",
      orderId: "order",
      fiscalDocumentId: "document",
      model: "nfce",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("focus_nfe_credentials_missing");
  });

  it("does not call an unverified Focus NFe cancel endpoint", async () => {
    const provider = new FocusNfeProvider(env);
    const result = await provider.cancelDocument({
      tenantId: "tenant",
      fiscalDocumentId: "document001",
      reason: "Erro operacional identificado apos emissao.",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("focus_nfe_cancel_not_implemented");
    expect(result.retryable).toBe(false);
  });
});

describe("NuvemFiscalProvider", () => {
  it("authenticates with OAuth and emits NFC-e through the sandbox endpoint", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });

      if (String(url).includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          id: "nfce-provider-id",
          chave: "35260600000000000191650010000000011000000010",
        }),
        { status: 200 },
      );
    };

    const provider = new NuvemFiscalProvider(env, fetcher);
    const result = await provider.issueConsumerInvoice({
      tenantId: "tenant",
      orderId: "order",
      fiscalDocumentId: "document",
      model: "nfce",
      environment: "homologation",
      payload: {
        nuvemFiscalPayload: {
          ambiente: "homologacao",
          infNFe: { versao: "4.00" },
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe("nfce-provider-id");
    expect(result.data?.accessKey).toBe("35260600000000000191650010000000011000000010");
    expect(calls[0]?.url).toBe("https://auth.nuvemfiscal.com.br/oauth/token");
    expect(calls[1]?.url).toBe("https://api.sandbox.nuvemfiscal.com.br/nfce");
    expect(calls[1]?.init?.headers).toMatchObject({ authorization: "Bearer access-token" });
  });

  it("fails without provider credentials", async () => {
    const { NUVEM_FISCAL_CLIENT_ID, NUVEM_FISCAL_CLIENT_SECRET, ...envWithoutCredentials } = env;
    void NUVEM_FISCAL_CLIENT_ID;
    void NUVEM_FISCAL_CLIENT_SECRET;

    const provider = new NuvemFiscalProvider(envWithoutCredentials);

    const result = await provider.issueConsumerInvoice({
      tenantId: "tenant",
      orderId: "order",
      fiscalDocumentId: "document",
      model: "nfce",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("nuvem_fiscal_credentials_missing");
  });
});
