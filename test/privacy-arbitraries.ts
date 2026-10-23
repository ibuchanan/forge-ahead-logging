import fc from "fast-check";

// Independent contract vocabulary: do not derive expected protections from production constants.
export const secretKeys = [
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "accessToken",
  "refreshToken",
  "contextToken",
  "jwt",
  "apiKey",
  "api_key",
  "password",
  "secret",
  "clientSecret",
  "client_secret",
] as const;

export const secretKey = fc.mixedCase(fc.constantFrom(...secretKeys));
