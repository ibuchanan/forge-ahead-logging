import { DEFAULT_REDACTION_CENSOR, isSecretShapedKey } from "./redaction.js";

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface LogValueSummaryOptions {
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
  redactedKeys?: readonly string[];
}

export const DEFAULT_LOG_VALUE_SUMMARY_OPTIONS: Required<LogValueSummaryOptions> =
  {
    maxDepth: 3,
    maxArrayItems: 5,
    maxObjectKeys: 12,
    maxStringLength: 240,
    redactedKeys: [],
  };

export function summarizeForLog(
  value: unknown,
  options?: LogValueSummaryOptions,
): JSONValue {
  const resolved: Required<LogValueSummaryOptions> = {
    ...DEFAULT_LOG_VALUE_SUMMARY_OPTIONS,
    ...options,
  };
  return summarizeValue(value, resolved, 0, new Set());
}

export function summarizeShapeForLog(
  value: unknown,
  options?: LogValueSummaryOptions,
): JSONValue {
  const resolved = { ...DEFAULT_LOG_VALUE_SUMMARY_OPTIONS, ...options };
  try {
    return summarizeShape(value, resolved, 0, new Set());
  } catch {
    return { type: "unknown", omitted: "unavailable" };
  }
}

function summarizeShape(
  value: unknown,
  options: Required<LogValueSummaryOptions>,
  depth: number,
  seen: ReadonlySet<unknown>,
): JSONValue {
  if (value === null) return { type: "null" };
  if (typeof value === "string")
    return { type: "string", length: value.length };
  if (typeof value !== "object") return { type: typeof value };
  const type = Array.isArray(value) ? "array" : "object";
  if (depth >= options.maxDepth) return { type, omitted: "max depth" };
  if (seen.has(value)) return { type, omitted: "circular" };
  const nextSeen = new Set(seen).add(value);
  const keys = Object.keys(value);
  const limit =
    type === "array" ? options.maxArrayItems : options.maxObjectKeys;
  const values = keys.slice(0, limit).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor
      ? summarizeShape(descriptor.value, options, depth + 1, nextSeen)
      : { type: "accessor" };
  });
  return {
    type,
    ...(Array.isArray(value) ? { items: value.length } : { keys: keys.length }),
    values,
    ...(keys.length > limit ? { omitted: keys.length - limit } : {}),
  };
}

export function summarizeValue(
  value: unknown,
  options: Required<LogValueSummaryOptions>,
  depth: number,
  seen: ReadonlySet<unknown>,
): JSONValue {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value === undefined) {
    return "[undefined]";
  }
  if (typeof value === "function") {
    return "[function]";
  }
  if (typeof value === "symbol") {
    return "[symbol]";
  }
  if (typeof value === "bigint") {
    return `[bigint ${value.toString()}]`;
  }
  if (typeof value === "string") {
    return summarizeString(value, options.maxStringLength);
  }
  // Every other typeof category already returned above, so value is
  // necessarily an array or plain object from here on.
  if (depth >= options.maxDepth) {
    return "[max depth reached]";
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  const nextSeen = new Set(seen).add(value);
  return Array.isArray(value)
    ? summarizeArray(value, options, depth, nextSeen)
    : summarizeObject(
        value as Record<string, unknown>,
        options,
        depth,
        nextSeen,
      );
}

function summarizeString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const omitted = value.length - maxLength;
  return `${value.slice(0, maxLength)}...[${omitted} chars omitted]`;
}

function summarizeArray(
  value: readonly unknown[],
  options: Required<LogValueSummaryOptions>,
  depth: number,
  seen: ReadonlySet<unknown>,
): JSONValue[] {
  const items = value
    .slice(0, options.maxArrayItems)
    .map((item) => summarizeValue(item, options, depth + 1, seen));
  const omittedCount = value.length - options.maxArrayItems;
  if (omittedCount > 0) {
    items.push(`[${omittedCount} more items omitted]`);
  }
  return items;
}

function summarizeObject(
  value: Record<string, unknown>,
  options: Required<LogValueSummaryOptions>,
  depth: number,
  seen: ReadonlySet<unknown>,
): { [key: string]: JSONValue } {
  const entries = Object.entries(value);
  const summary: { [key: string]: JSONValue } = {};
  for (const [key, entryValue] of entries.slice(0, options.maxObjectKeys)) {
    summary[key] = isSecretShapedKey(key, options.redactedKeys)
      ? DEFAULT_REDACTION_CENSOR
      : summarizeValue(entryValue, options, depth + 1, seen);
  }
  const omittedCount = entries.length - options.maxObjectKeys;
  if (omittedCount > 0) {
    summary[`[${omittedCount} more keys omitted]`] = true;
  }
  return summary;
}
