import { createHmac, timingSafeEqual } from "node:crypto";

const csrfVersion = "v1";

export function createCsrfToken(sessionToken: string, secret: string) {
  return `${csrfVersion}.${signCsrfToken(sessionToken, secret)}`;
}

export function verifyCsrfToken(input: {
  token: string | undefined;
  sessionToken: string | undefined;
  secret: string;
}) {
  if (!input.token || !input.sessionToken) {
    return false;
  }

  const [version, signature] = input.token.split(".");
  if (version !== csrfVersion || !signature) {
    return false;
  }

  const expected = signCsrfToken(input.sessionToken, input.secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function signCsrfToken(sessionToken: string, secret: string) {
  return createHmac("sha256", secret).update(sessionToken).digest("base64url");
}
