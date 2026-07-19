import { describe, expect, it } from "vitest";
import { ApiError, getErrorMessage, isApiUnavailable, isUnauthorized } from "./client";

describe("web API error helpers", () => {
  it("classifies auth and unavailable API errors", () => {
    expect(isUnauthorized(new ApiError(401, { message: "Sessão expirada" }))).toBe(true);
    expect(isApiUnavailable(new ApiError(503, { message: "Serviço indisponível" }))).toBe(true);
    expect(isApiUnavailable(new TypeError("fetch failed"))).toBe(true);
    expect(isApiUnavailable(new ApiError(400, { message: "Dados inválidos" }))).toBe(false);
  });

  it("extracts professional messages with fallback", () => {
    expect(getErrorMessage(new ApiError(400, { message: "Dados inválidos" }))).toBe(
      "Dados inválidos",
    );
    expect(getErrorMessage(null, "Falha controlada")).toBe("Falha controlada");
  });
});
