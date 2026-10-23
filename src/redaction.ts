import type pino from "pino";

/** Secret-shaped key names. The one source for pino's paths and for key matching. */
const SECRET_KEYS = [
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

// Pino matches paths case-sensitively, so the conventional HTTP header casings
// need their own paths. Our own key matching is case-insensitive.
const HEADER_CASINGS = ["Authorization", "Cookie", "Set-Cookie"] as const;

/**
 * A best-effort backstop against representative secret-shaped fields, not a
 * complete model of every Forge or Atlassian payload. Allow-list logging
 * through Object Summary Policies remains the primary leak-prevention
 * mechanism.
 */
export const DEFAULT_REDACT_PATHS: readonly string[] = [
  ...SECRET_KEYS,
  ...HEADER_CASINGS,
].flatMap((key) => [key, `*.${key}`]);

export const DEFAULT_REDACTION_CENSOR = "[redacted]";

function redactPathsOf(
  redact: pino.LoggerOptions["redact"] | undefined,
): readonly string[] {
  if (!redact) {
    return [];
  }
  return Array.isArray(redact) ? redact : redact.paths;
}

export function withDefaultRedaction(
  redact?: pino.LoggerOptions["redact"],
): pino.redactOptions {
  return {
    paths: [...DEFAULT_REDACT_PATHS, ...redactPathsOf(redact)],
    censor: DEFAULT_REDACTION_CENSOR,
    remove: false,
  };
}

const DEFAULT_SECRET_SHAPED_KEYS: ReadonlySet<string> = new Set(
  SECRET_KEYS.map((key) => key.toLowerCase()),
);

export function isSecretShapedKey(
  key: string,
  redactedKeys: readonly string[],
): boolean {
  const lowerKey = key.toLowerCase();
  return (
    DEFAULT_SECRET_SHAPED_KEYS.has(lowerKey) ||
    redactedKeys.some((redactedKey) => redactedKey.toLowerCase() === lowerKey)
  );
}

interface RedactionBudget {
  entries: number;
  characters: number;
}

const MAX_REDACTION_DEPTH = 32;
const MAX_REDACTION_ENTRIES = 10_000;
const MAX_REDACTION_CHARACTERS = 1_000_000;
const REDACTION_LIMIT = Symbol("redaction limit");

export function redactLogRecord(
  ...sources: Record<string, unknown>[]
): Record<string, unknown> {
  try {
    const merged = {};
    let entries = 0;
    // Merge descriptors so overridden getters are not evaluated before the backstop.
    for (const source of sources) {
      for (const key in source) {
        if (!Object.hasOwn(source, key)) continue;
        if (++entries > MAX_REDACTION_ENTRIES) throw REDACTION_LIMIT;
        Object.defineProperty(merged, key, {
          ...Object.getOwnPropertyDescriptor(source, key),
          configurable: true,
        });
      }
    }
    return redactRecordValue(merged, {
      entries: MAX_REDACTION_ENTRIES,
      characters: MAX_REDACTION_CHARACTERS,
    }) as Record<string, unknown>;
  } catch (error) {
    return {
      logRecordOmitted:
        error === REDACTION_LIMIT
          ? "redaction limit reached"
          : "redaction unavailable",
    };
  }
}

function redactPrimitive(value: unknown, budget: RedactionBudget): unknown {
  if (typeof value === "string") {
    budget.characters -= value.length;
    if (budget.characters < 0) throw REDACTION_LIMIT;
  }
  return typeof value === "function" ? undefined : value;
}

function isBoxedPrimitive(
  value: object,
): value is { valueOf(): string | number | boolean } {
  return (
    value instanceof String ||
    value instanceof Number ||
    value instanceof Boolean
  );
}

// `key` is the property name `toJSON` receives; undefined means toJSON does not
// apply, as for the merged root and for values that toJSON or valueOf produced.
function redactRecordValue(
  value: unknown,
  budget: RedactionBudget,
  seen = new Set<object>(),
  depth = 0,
  key?: string,
): unknown {
  if (value === null || typeof value !== "object")
    return redactPrimitive(value, budget);
  if (seen.has(value)) return "[omitted: circular]";
  if (depth >= MAX_REDACTION_DEPTH) throw REDACTION_LIMIT;
  if (
    key !== undefined &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  ) {
    return redactRecordValue(value.toJSON(key), budget, seen, depth + 1);
  }
  if (isBoxedPrimitive(value)) {
    return redactRecordValue(value.valueOf(), budget, seen, depth);
  }
  return redactContainer(value, budget, seen, depth);
}

function redactContainer(
  value: object,
  budget: RedactionBudget,
  seen: Set<object>,
  depth: number,
): unknown {
  seen.add(value);
  const result = Array.isArray(value)
    ? redactArray(value as unknown[], budget, seen, depth)
    : redactObject(value as Record<string, unknown>, budget, seen, depth);
  seen.delete(value);
  return result;
}

function redactArray(
  arr: unknown[],
  budget: RedactionBudget,
  seen: Set<object>,
  depth: number,
): unknown[] {
  budget.entries -= arr.length;
  if (budget.entries < 0) throw REDACTION_LIMIT;
  return Array.from({ length: arr.length }, (_, index) =>
    redactRecordValue(arr[index], budget, seen, depth + 1, String(index)),
  );
}

function redactObject(
  obj: Record<string, unknown>,
  budget: RedactionBudget,
  seen: Set<object>,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) continue;
    if (--budget.entries < 0) throw REDACTION_LIMIT;
    budget.characters -= key.length;
    if (budget.characters < 0) throw REDACTION_LIMIT;
    const entry = isSecretShapedKey(key, [])
      ? DEFAULT_REDACTION_CENSOR
      : redactRecordValue(obj[key], budget, seen, depth + 1, key);
    Object.defineProperty(result, key, {
      value: entry,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}
