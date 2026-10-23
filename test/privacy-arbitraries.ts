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

// Unique, recognizable private payload. The prefix keeps it from colliding with log vocabulary.
const canary = fc
  .stringMatching(/^[0-9a-f]{12}$/)
  .map((hex) => `PRIVATE-${hex}`);

// Keys whose values the contract deliberately emits (policy-selected event fields,
// error codes/types/statuses/names, aggregate members), so planting there is not a leak.
const emittedKeys = new Set([
  "eventType",
  "method",
  "requestId",
  "context",
  "call",
  "app",
  "selfGenerated",
  "code",
  "type",
  "status",
  "name",
  "errors",
  "__proto__",
]);

const plantKey = fc
  .oneof(
    fc.constantFrom("a", "b", "message", "detail", "title", "cause", "cloudId"),
    fc.string({ maxLength: 6 }),
  )
  .filter((key) => !emittedKeys.has(key));

export interface Plant {
  canary: string;
  root: string;
  rest: { key: string; array: boolean }[];
  asKey: boolean;
  noise: unknown;
}

export const plant: fc.Arbitrary<Plant> = fc.record({
  canary,
  root: plantKey,
  rest: fc.array(fc.record({ key: plantKey, array: fc.boolean() }), {
    maxLength: 3,
  }),
  asKey: fc.boolean(),
  noise: fc.jsonValue({ maxDepth: 1 }),
});

/** Nests the canary under `root` and `rest`, as a value or as an object key. */
export function plantedValue({ canary, rest, asKey, noise }: Plant): unknown {
  let value: unknown = asKey ? { [canary]: noise } : canary;
  for (const { key, array } of [...rest].reverse()) {
    value = array ? [value, noise] : { [key]: value, sibling: noise };
  }
  return value;
}
