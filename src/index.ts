import type { ProblemDetails, Result } from "@forge-ahead/errors";
import { toProblemDetails } from "@forge-ahead/errors";
import pino from "pino";

export type ForgeLogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"
  | "silent";

export type ForgeLogLevelSource = "LOG_LEVEL" | "NODE_ENV" | "default";

export interface ResolvedForgeLogLevel {
  level: ForgeLogLevel;
  source: ForgeLogLevelSource;
  invalidValue?: string;
}

const FORGE_LOG_LEVELS: readonly ForgeLogLevel[] = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
];

function isForgeLogLevel(value: string): value is ForgeLogLevel {
  return (FORGE_LOG_LEVELS as readonly string[]).includes(value);
}

export function resolveLogLevel(
  env: Record<string, string | undefined> = process.env,
): ResolvedForgeLogLevel {
  const rawLevel = env.LOG_LEVEL;
  if (rawLevel !== undefined) {
    if (isForgeLogLevel(rawLevel)) {
      return { level: rawLevel, source: "LOG_LEVEL" };
    }
    return { level: "info", source: "default", invalidValue: rawLevel };
  }
  if (env.NODE_ENV === "development") {
    return { level: "debug", source: "NODE_ENV" };
  }
  return { level: "info", source: "default" };
}

export function getLogLevel(
  env: Record<string, string | undefined> = process.env,
): ForgeLogLevel {
  return resolveLogLevel(env).level;
}

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

function baseNameOf(path: string): string {
  const segments = path.split(".");
  return segments[segments.length - 1].toLowerCase();
}

const DEFAULT_SECRET_SHAPED_KEYS: readonly string[] = Array.from(
  new Set(DEFAULT_REDACT_PATHS.map(baseNameOf)),
);

function isSecretShapedKey(
  key: string,
  redactedKeys: readonly string[],
): boolean {
  const lowerKey = key.toLowerCase();
  return (
    DEFAULT_SECRET_SHAPED_KEYS.includes(lowerKey) ||
    redactedKeys.some((redactedKey) => redactedKey.toLowerCase() === lowerKey)
  );
}

function summarizeValue(
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
    if (value.length > options.maxStringLength) {
      const omitted = value.length - options.maxStringLength;
      return `${value.slice(0, options.maxStringLength)}...[${omitted} chars omitted]`;
    }
    return value;
  }
  if (
    depth >= options.maxDepth &&
    (Array.isArray(value) || typeof value === "object")
  ) {
    return "[max depth reached]";
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[circular]";
    }
    const nextSeen = new Set(seen).add(value);
    const items = value
      .slice(0, options.maxArrayItems)
      .map((item) => summarizeValue(item, options, depth + 1, nextSeen));
    const omittedCount = value.length - options.maxArrayItems;
    if (omittedCount > 0) {
      items.push(`[${omittedCount} more items omitted]`);
    }
    return items;
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }
    const nextSeen = new Set(seen).add(value);
    const entries = Object.entries(value as Record<string, unknown>);
    const summary: { [key: string]: JSONValue } = {};
    for (const [key, entryValue] of entries.slice(0, options.maxObjectKeys)) {
      summary[key] = isSecretShapedKey(key, options.redactedKeys)
        ? DEFAULT_REDACTION_CENSOR
        : summarizeValue(entryValue, options, depth + 1, nextSeen);
    }
    const omittedCount = entries.length - options.maxObjectKeys;
    if (omittedCount > 0) {
      summary[`[${omittedCount} more keys omitted]`] = true;
    }
    return summary;
  }
  return null;
}

export type LogFieldPath = string | readonly string[];
export type LogFieldTransform =
  | "identity"
  | "redact"
  | "tokenPreview"
  | "omittedShape";

export type LogFieldSelection =
  | LogFieldPath
  | {
      path: LogFieldPath;
      transform?: LogFieldTransform;
    };

export type LogFieldMap = Readonly<Record<string, LogFieldSelection>>;

export interface LogObjectSummaryPolicy {
  kind: string;
  fields: LogFieldMap;
  labels?: LogFieldMap;
}

export interface LogObjectSummaryOptions extends LogValueSummaryOptions {
  includeLabels?: boolean;
}

export function defineLogObjectSummaryPolicy(
  policy: LogObjectSummaryPolicy,
): LogObjectSummaryPolicy {
  return policy;
}

function pathSegments(path: LogFieldPath): readonly string[] {
  return typeof path === "string" ? path.split(".") : path;
}

function getAtPath(
  value: unknown,
  path: LogFieldPath,
): { found: boolean; value: unknown } {
  let current: unknown = value;
  for (const segment of pathSegments(path)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !(segment in current)
    ) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

function hasFieldSelectionPath(
  selection: LogFieldSelection,
): selection is { path: LogFieldPath; transform?: LogFieldTransform } {
  return typeof selection === "object" && !Array.isArray(selection);
}

function selectionPathAndTransform(selection: LogFieldSelection): {
  path: LogFieldPath;
  transform: LogFieldTransform;
} {
  if (hasFieldSelectionPath(selection)) {
    return {
      path: selection.path,
      transform: selection.transform ?? "identity",
    };
  }
  return { path: selection, transform: "identity" };
}

function omittedShapeOf(value: unknown): JSONValue {
  if (typeof value === "string") {
    return { omitted: true, length: value.length };
  }
  if (Array.isArray(value)) {
    return { omitted: true, items: value.length };
  }
  if (value !== null && typeof value === "object") {
    return { omitted: true, keys: Object.keys(value).length };
  }
  return { omitted: true };
}

function applyFieldTransform(
  transform: LogFieldTransform,
  value: unknown,
  options: Required<LogValueSummaryOptions>,
): JSONValue {
  switch (transform) {
    case "redact":
      return DEFAULT_REDACTION_CENSOR;
    case "tokenPreview":
      return typeof value === "string"
        ? `${value.slice(0, 3)}...${value.slice(-3)}`
        : DEFAULT_REDACTION_CENSOR;
    case "omittedShape":
      return omittedShapeOf(value);
    default:
      return summarizeValue(value, options, 0, new Set());
  }
}

function summarizeFieldMap(
  value: unknown,
  fields: LogFieldMap,
  options: Required<LogValueSummaryOptions>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [alias, selection] of Object.entries(fields)) {
    const { path, transform } = selectionPathAndTransform(selection);
    const { found, value: fieldValue } = getAtPath(value, path);
    if (!found) {
      continue;
    }
    result[alias] = applyFieldTransform(transform, fieldValue, options);
  }
  return result;
}

export function summarizeObjectForLog(
  value: unknown,
  policy: LogObjectSummaryPolicy,
  options?: LogObjectSummaryOptions,
): Record<string, unknown> {
  const resolvedOptions: Required<LogValueSummaryOptions> = {
    ...DEFAULT_LOG_VALUE_SUMMARY_OPTIONS,
    ...options,
  };
  const labels =
    options?.includeLabels && policy.labels
      ? summarizeFieldMap(value, policy.labels, resolvedOptions)
      : {};
  return {
    kind: policy.kind,
    ...summarizeFieldMap(value, policy.fields, resolvedOptions),
    ...labels,
  };
}

export const FORGE_EVENT_SUMMARY_POLICY = defineLogObjectSummaryPolicy({
  kind: "forgeEvent",
  fields: {
    eventType: "eventType",
    method: "method",
    path: "path",
    requestId: "requestId",
    cloudId: "context.cloudId",
    moduleKey: "context.moduleKey",
    functionKey: "call.functionKey",
    appId: "app.id",
    appVersion: "app.version",
    selfGenerated: "selfGenerated",
    queryParameters: "queryParameters",
    contextToken: {
      path: "contextToken",
      transform: "tokenPreview",
    },
    headers: {
      path: "headers",
      transform: "omittedShape",
    },
    body: {
      path: "body",
      transform: "omittedShape",
    },
  },
});

export function summarizeForgeInvocation(
  event: unknown,
  options?: LogValueSummaryOptions,
): Record<string, unknown> {
  return summarizeObjectForLog(event, FORGE_EVENT_SUMMARY_POLICY, options);
}

export interface ForgeInvocationLogOptions extends LogValueSummaryOptions {
  level?: "debug" | "info";
  includeEventShape?: boolean;
}

function isVerboseLevelEnabled(logger: ForgeLogger): boolean {
  return unwrapPinoLogger(logger).isLevelEnabled("debug");
}

export function logForgeInvocation(
  logger: ForgeLogger,
  event: unknown,
  message?: string,
  options?: ForgeInvocationLogOptions,
): void {
  const summary = summarizeForgeInvocation(event, options);
  if (options?.includeEventShape) {
    if (isVerboseLevelEnabled(logger)) {
      summary.eventShape = summarizeForLog(event, options);
    } else {
      summary.eventShapeOmitted = "requires debug or trace";
    }
  }
  const level = options?.level ?? "info";
  logger[level](summary, message);
}

export interface LogResultOptions<T, E> {
  message?: string;
  successMessage?: string;
  errorMessage?: string;
  successLevel?: "debug" | "info";
  errorLevel?: "warn" | "error";
  summarizeOk?: (value: T) => Record<string, unknown>;
  summarizeErr?: (error: E) => Record<string, unknown>;
}

function approvedProblemFields(
  problemDetails: ProblemDetails,
): Record<string, unknown> {
  const { type, title, status, detail, timestamp, instance } = problemDetails;
  const approved: Record<string, unknown> = {
    type,
    title,
    status,
    detail,
    timestamp,
  };
  if (instance !== undefined) {
    approved.instance = instance;
  }
  return approved;
}

function buildErrorMetadata(
  logger: ForgeLogger,
  error: unknown,
  status?: number,
): Record<string, unknown> {
  const problemDetails = toProblemDetails(error, status ?? 500);
  const metadata = approvedProblemFields(problemDetails);
  if (error instanceof Error) {
    metadata.errorName = error.name;
    if (error.stack && isVerboseLevelEnabled(logger)) {
      metadata.stack = error.stack;
    }
  }
  return metadata;
}

export function logResult<T, E = ProblemDetails>(
  logger: ForgeLogger,
  result: Result<T, E>,
  options?: LogResultOptions<T, E>,
): void {
  if (result.isOk()) {
    const level = options?.successLevel ?? "debug";
    const metadata: Record<string, unknown> = { ok: true };
    if (options?.summarizeOk) {
      Object.assign(metadata, options.summarizeOk(result.value));
    }
    logger[level](metadata, options?.successMessage ?? options?.message);
    return;
  }
  const level = options?.errorLevel ?? "error";
  const metadata = buildErrorMetadata(logger, result.error);
  if (options?.summarizeErr) {
    Object.assign(metadata, options.summarizeErr(result.error));
  }
  logger[level](metadata, options?.errorMessage ?? options?.message);
}

export interface LogErrorOptions {
  message?: string;
  level?: "warn" | "error" | "fatal";
  status?: number;
}

export function logError(
  logger: ForgeLogger,
  error: unknown,
  options?: LogErrorOptions,
): void {
  const level = options?.level ?? "error";
  const metadata = buildErrorMetadata(logger, error, options?.status);
  logger[level](metadata, options?.message);
}

export type LogMethod = (
  obj: Record<string, unknown>,
  message?: string,
) => void;

export interface ForgeLoggerOptions {
  name?: string;
  env?: Record<string, string | undefined>;
  redact?: pino.LoggerOptions["redact"];
  base?: pino.LoggerOptions["base"];
}

export interface ForgeLogger {
  fatal: LogMethod;
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  trace: LogMethod;
  child(bindings: Record<string, unknown>): ForgeLogger;
  forgeInvocation(
    event: unknown,
    message?: string,
    options?: ForgeInvocationLogOptions,
  ): void;
  result<T, E = ProblemDetails>(
    result: Result<T, E>,
    options?: LogResultOptions<T, E>,
  ): void;
  errorResult(error: unknown, options?: LogErrorOptions): void;
}

const underlyingPinoLoggers = new WeakMap<ForgeLogger, pino.Logger>();

function wrapPinoLogger(pinoLogger: pino.Logger): ForgeLogger {
  const forgeLogger: ForgeLogger = {
    fatal: (obj, message) => pinoLogger.fatal(obj, message),
    error: (obj, message) => pinoLogger.error(obj, message),
    warn: (obj, message) => pinoLogger.warn(obj, message),
    info: (obj, message) => pinoLogger.info(obj, message),
    debug: (obj, message) => pinoLogger.debug(obj, message),
    trace: (obj, message) => pinoLogger.trace(obj, message),
    child: (bindings) => wrapPinoLogger(pinoLogger.child(bindings)),
    forgeInvocation: (event, message, options) =>
      logForgeInvocation(forgeLogger, event, message, options),
    result: (result, options) => logResult(forgeLogger, result, options),
    errorResult: (error, options) => logError(forgeLogger, error, options),
  };
  underlyingPinoLoggers.set(forgeLogger, pinoLogger);
  return forgeLogger;
}

export function unwrapPinoLogger(logger: ForgeLogger): pino.Logger {
  const pinoLogger = underlyingPinoLoggers.get(logger);
  if (!pinoLogger) {
    throw new Error("Expected a ForgeLogger created by createForgeLogger().");
  }
  return pinoLogger;
}

export function createForgeLogger(
  options: ForgeLoggerOptions = {},
): ForgeLogger {
  const env = options.env ?? process.env;
  const { level } = resolveLogLevel(env);
  const pinoLogger = pino({
    level,
    name: options.name,
    base: options.base ?? {},
    redact: withDefaultRedaction(options.redact),
  });
  return wrapPinoLogger(pinoLogger);
}
