import type pino from "pino";

/**
 * A best-effort backstop against representative secret-shaped fields, not a
 * complete model of every Forge or Atlassian payload. Allow-list logging
 * through Object Summary Policies remains the primary leak-prevention
 * mechanism.
 */
export const DEFAULT_REDACT_PATHS: readonly string[] = [
  "*.authorization",
  "*.Authorization",
  "*.cookie",
  "*.Cookie",
  "*.set-cookie",
  "*.Set-Cookie",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.contextToken",
  "*.jwt",
  "*.apiKey",
  "*.api_key",
  "*.password",
  "*.secret",
  "*.clientSecret",
  "*.client_secret",
  "authorization",
  "Authorization",
  "contextToken",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "apiKey",
  "api_key",
  "password",
  "secret",
  "clientSecret",
  "client_secret",
];

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
): pino.LoggerOptions["redact"] {
  return {
    paths: [...DEFAULT_REDACT_PATHS, ...redactPathsOf(redact)],
    censor: DEFAULT_REDACTION_CENSOR,
    remove: false,
  };
}

function baseNameOf(path: string): string {
  const segments = path.split(".");
  return segments[segments.length - 1].toLowerCase();
}

const DEFAULT_SECRET_SHAPED_KEYS: readonly string[] = Array.from(
  new Set(DEFAULT_REDACT_PATHS.map(baseNameOf)),
);

export function isSecretShapedKey(
  key: string,
  redactedKeys: readonly string[],
): boolean {
  const lowerKey = key.toLowerCase();
  return (
    DEFAULT_SECRET_SHAPED_KEYS.includes(lowerKey) ||
    redactedKeys.some((redactedKey) => redactedKey.toLowerCase() === lowerKey)
  );
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

function redactRecordValue(
  value: unknown,
  budget: { entries: number; characters: number },
  seen = new Set<object>(),
  depth = 0,
  key = "",
  applyToJSON = false,
): unknown {
  if (typeof value === "string") {
    budget.characters -= value.length;
    if (budget.characters < 0) throw REDACTION_LIMIT;
  }
  if (typeof value === "function") return undefined;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_REDACTION_DEPTH) throw REDACTION_LIMIT;
  if (applyToJSON && "toJSON" in value && typeof value.toJSON === "function") {
    return redactRecordValue(value.toJSON(key), budget, seen, depth + 1, key);
  }
  if (
    value instanceof String ||
    value instanceof Number ||
    value instanceof Boolean
  ) {
    return redactRecordValue(value.valueOf(), budget, seen, depth, key);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    budget.entries -= value.length;
    if (budget.entries < 0) throw REDACTION_LIMIT;
    const result = Array.from({ length: value.length }, (_, index) =>
      redactRecordValue(
        value[index],
        budget,
        seen,
        depth + 1,
        String(index),
        true,
      ),
    );
    seen.delete(value);
    return result;
  }
  const result: Record<string, unknown> = {};
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (--budget.entries < 0) throw REDACTION_LIMIT;
    budget.characters -= key.length;
    if (budget.characters < 0) throw REDACTION_LIMIT;
    const entry = isSecretShapedKey(key, [])
      ? DEFAULT_REDACTION_CENSOR
      : redactRecordValue(
          (value as Record<string, unknown>)[key],
          budget,
          seen,
          depth + 1,
          key,
          true,
        );
    Object.defineProperty(result, key, {
      value: entry,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  seen.delete(value);
  return result;
}
