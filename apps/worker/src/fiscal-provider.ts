import { type AppEnv, loadEnv } from "@giromesa/config";
import type { FiscalProvider, ProviderResult } from "@giromesa/domain";

type FiscalIssueInput = Parameters<FiscalProvider["issueConsumerInvoice"]>[0];

type Fetcher = typeof fetch;
type AccessTokenResult =
  | { ok: true; data: { accessToken: string; expiresAt: number } }
  | { ok: false; errorCode: string; errorMessage: string; retryable: boolean };

function mockAccessKey(documentId: string, number: number | null) {
  const source = `${number ?? 1}${documentId.replaceAll("-", "")}`.replace(/\D/g, "");
  return `35${source}`.padEnd(44, "0").slice(0, 44);
}

function cleanUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function readProviderError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    if ("message" in payload) {
      return String((payload as { message: unknown }).message);
    }
    if ("error" in payload) {
      return String((payload as { error: unknown }).error);
    }
  }
  return fallback;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class MockFiscalProvider implements FiscalProvider {
  async issueConsumerInvoice(
    input: FiscalIssueInput,
  ): Promise<ProviderResult<{ accessKey?: string; xmlUrl?: string; danfeUrl?: string }>> {
    const accessKey = mockAccessKey(input.fiscalDocumentId, input.number ?? null);

    return {
      ok: true,
      externalId: `mock-${input.fiscalDocumentId}`,
      data: {
        accessKey,
        xmlUrl: `/mock-fiscal/${input.fiscalDocumentId}.xml`,
        danfeUrl: `/mock-fiscal/${input.fiscalDocumentId}.pdf`,
      },
    };
  }

  async cancelDocument(input: {
    tenantId: string;
    fiscalDocumentId: string;
    reason: string;
  }): Promise<ProviderResult<{ canceledAt: string }>> {
    return {
      ok: true,
      externalId: `mock-cancel-${input.fiscalDocumentId}`,
      data: { canceledAt: new Date().toISOString() },
    };
  }
}

export class NuvemFiscalProvider implements FiscalProvider {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly env: AppEnv = loadEnv(),
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async issueConsumerInvoice(
    input: FiscalIssueInput,
  ): Promise<ProviderResult<{ accessKey?: string; xmlUrl?: string; danfeUrl?: string }>> {
    if (input.model && input.model !== "nfce") {
      return {
        ok: false,
        errorCode: "unsupported_fiscal_model",
        errorMessage: "Nuvem Fiscal provider currently supports NFC-e in GiroMesa.",
        retryable: false,
      };
    }

    const token = await this.getAccessToken();
    if (!token.ok) {
      return {
        ok: false,
        errorCode: token.errorCode,
        errorMessage: token.errorMessage,
        retryable: token.retryable,
      };
    }

    const baseUrl = this.baseUrl(input.environment);
    const body = this.buildNfcePayload(input);
    const response = await this.fetcher(`${baseUrl}/nfce`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token.data.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        errorCode: `nuvem_fiscal_http_${response.status}`,
        errorMessage: readProviderError(payload, "Nuvem Fiscal rejected the NFC-e request"),
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    const externalId = this.readId(payload) ?? input.fiscalDocumentId;
    const accessKey = this.readString(payload, ["chave", "chave_acesso", "chaveAcesso"]);

    return {
      ok: true,
      externalId,
      data: {
        ...(accessKey ? { accessKey } : {}),
        xmlUrl: `/provider/nuvem-fiscal/nfce/${externalId}/xml`,
        danfeUrl: `/provider/nuvem-fiscal/nfce/${externalId}/pdf`,
      },
    };
  }

  async cancelDocument(input: {
    tenantId: string;
    fiscalDocumentId: string;
    reason: string;
  }): Promise<ProviderResult<{ canceledAt: string }>> {
    const token = await this.getAccessToken();
    if (!token.ok) {
      return {
        ok: false,
        errorCode: token.errorCode,
        errorMessage: token.errorMessage,
        retryable: token.retryable,
      };
    }

    const response = await this.fetcher(
      `${cleanUrl(this.env.NUVEM_FISCAL_SANDBOX_URL)}/nfce/${encodeURIComponent(input.fiscalDocumentId)}/cancelamento`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token.data.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ justificativa: input.reason }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        errorCode: `nuvem_fiscal_cancel_http_${response.status}`,
        errorMessage: readProviderError(payload, "Nuvem Fiscal rejected the cancel request"),
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    return {
      ok: true,
      externalId: this.readId(payload) ?? input.fiscalDocumentId,
      data: { canceledAt: new Date().toISOString() },
    };
  }

  private buildNfcePayload(input: FiscalIssueInput) {
    const payload = input.payload ?? {};
    const nuvemPayload = payload.nuvemFiscalPayload;

    if (nuvemPayload && typeof nuvemPayload === "object" && !Array.isArray(nuvemPayload)) {
      return nuvemPayload;
    }

    return {
      ...payload,
      ambiente: input.environment === "production" ? "producao" : "homologacao",
      referencia: input.fiscalDocumentId,
      pedido: input.orderId,
    };
  }

  private baseUrl(environment: FiscalIssueInput["environment"]) {
    return cleanUrl(
      environment === "production"
        ? this.env.NUVEM_FISCAL_PRODUCTION_URL
        : this.env.NUVEM_FISCAL_SANDBOX_URL,
    );
  }

  private async getAccessToken(): Promise<AccessTokenResult> {
    const now = Date.now();
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > now) {
      return {
        ok: true,
        data: { accessToken: this.accessToken.value, expiresAt: this.accessToken.expiresAt },
      };
    }

    if (!this.env.NUVEM_FISCAL_CLIENT_ID || !this.env.NUVEM_FISCAL_CLIENT_SECRET) {
      return {
        ok: false,
        errorCode: "nuvem_fiscal_credentials_missing",
        errorMessage: "NUVEM_FISCAL_CLIENT_ID and NUVEM_FISCAL_CLIENT_SECRET are required.",
        retryable: false,
      };
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.env.NUVEM_FISCAL_CLIENT_ID,
      client_secret: this.env.NUVEM_FISCAL_CLIENT_SECRET,
      scope: this.env.NUVEM_FISCAL_SCOPE,
    });

    const response = await this.fetcher(this.env.NUVEM_FISCAL_AUTH_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        errorCode: `nuvem_fiscal_auth_http_${response.status}`,
        errorMessage: readProviderError(payload, "Failed to authenticate with Nuvem Fiscal"),
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    const tokenPayload = payload as { access_token?: string; expires_in?: number };
    if (!tokenPayload.access_token) {
      return {
        ok: false,
        errorCode: "nuvem_fiscal_auth_invalid_response",
        errorMessage: "Nuvem Fiscal auth response did not include access_token.",
        retryable: true,
      };
    }

    const expiresAt = now + (tokenPayload.expires_in ?? 3600) * 1000;
    this.accessToken = { value: tokenPayload.access_token, expiresAt };

    return { ok: true, data: { accessToken: tokenPayload.access_token, expiresAt } };
  }

  private readId(payload: unknown) {
    return this.readString(payload, ["id", "uuid", "id_nuvem_fiscal", "referencia"]);
  }

  private readString(payload: unknown, keys: string[]) {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }

    return undefined;
  }
}

export class FocusNfeProvider implements FiscalProvider {
  constructor(
    private readonly env: AppEnv = loadEnv(),
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async issueConsumerInvoice(
    input: FiscalIssueInput,
  ): Promise<ProviderResult<{ accessKey?: string; xmlUrl?: string; danfeUrl?: string }>> {
    if (input.model && input.model !== "nfce") {
      return {
        ok: false,
        errorCode: "unsupported_fiscal_model",
        errorMessage: "Focus NFe provider currently supports NFC-e in GiroMesa.",
        retryable: false,
      };
    }

    if (!this.env.FOCUS_NFE_TOKEN) {
      return {
        ok: false,
        errorCode: "focus_nfe_credentials_missing",
        errorMessage: "FOCUS_NFE_TOKEN is required.",
        retryable: false,
      };
    }

    const body = this.buildNfcePayload(input);
    const ref = this.readReference(input);
    const response = await this.fetcher(
      `${this.baseUrl(input.environment)}/v2/nfce?ref=${encodeURIComponent(ref)}&completa=1`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: this.authorizationHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        errorCode: `focus_nfe_http_${response.status}`,
        errorMessage: readProviderError(payload, "Focus NFe rejected the NFC-e request"),
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    const status = this.readString(payload, ["status", "codigo_status"]);
    const authorized = !status || ["autorizado", "authorized", "100"].includes(status);
    if (!authorized) {
      return {
        ok: false,
        externalId: ref,
        errorCode: `focus_nfe_${status}`,
        errorMessage: readProviderError(payload, "Focus NFe did not authorize the NFC-e"),
        retryable: status === "em_processamento" || status === "processando_autorizacao",
      };
    }

    const accessKey = this.readString(payload, ["chave_nfe", "chave", "chave_acesso"]);
    const xmlUrl = this.readString(payload, ["caminho_xml_nota_fiscal", "url_xml", "xml"]);
    const danfeUrl = this.readString(payload, ["caminho_danfe", "url_danfe", "danfe"]);

    return {
      ok: true,
      externalId: ref,
      data: {
        ...(accessKey ? { accessKey } : {}),
        xmlUrl: xmlUrl ?? `/provider/focus-nfe/nfce/${ref}/xml`,
        danfeUrl: danfeUrl ?? `/provider/focus-nfe/nfce/${ref}/danfe`,
      },
    };
  }

  async cancelDocument(input: {
    tenantId: string;
    fiscalDocumentId: string;
    reason: string;
  }): Promise<ProviderResult<{ canceledAt: string }>> {
    if (!this.env.FOCUS_NFE_TOKEN) {
      return {
        ok: false,
        errorCode: "focus_nfe_credentials_missing",
        errorMessage: "FOCUS_NFE_TOKEN is required.",
        retryable: false,
      };
    }

    return {
      ok: false,
      externalId: input.fiscalDocumentId,
      errorCode: "focus_nfe_cancel_not_implemented",
      errorMessage:
        "Focus NFe cancelamento real ainda precisa ser habilitado com endpoint validado em homologacao.",
      retryable: false,
    };
  }

  private buildNfcePayload(input: FiscalIssueInput) {
    const payload = input.payload ?? {};
    const focusPayload = payload.focusNfePayload;

    if (focusPayload && typeof focusPayload === "object" && !Array.isArray(focusPayload)) {
      return focusPayload;
    }

    return payload;
  }

  private readReference(input: FiscalIssueInput) {
    return input.fiscalDocumentId.replace(/[^a-zA-Z0-9]/g, "");
  }

  private baseUrl(environment: FiscalIssueInput["environment"]) {
    return cleanUrl(
      environment === "production"
        ? this.env.FOCUS_NFE_PRODUCTION_URL
        : this.env.FOCUS_NFE_HOMOLOGATION_URL,
    );
  }

  private authorizationHeader() {
    const token = Buffer.from(`${this.env.FOCUS_NFE_TOKEN}:`).toString("base64");
    return `Basic ${token}`;
  }

  private readString(payload: unknown, keys: string[]) {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
      if (typeof value === "number") {
        return String(value);
      }
    }

    return undefined;
  }
}

export function createFiscalProvider(provider: string, env: AppEnv = loadEnv()): FiscalProvider {
  if (provider === "focus_nfe") {
    return new FocusNfeProvider(env);
  }

  if (provider === "nuvem_fiscal") {
    return new NuvemFiscalProvider(env);
  }

  return new MockFiscalProvider();
}
