import type { ProblemDetails, Result } from "@forge-ahead/errors";
import { toProblemDetails } from "@forge-ahead/errors";
import { AsyncLocalStorage } from "node:async_hooks";
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

export function resolveLogLevel(): ResolvedForgeLogLevel;
export function resolveLogLevel(
  env: Record<string, string | undefined>,
): ResolvedForgeLogLevel;
export function resolveLogLevel(
  name: string | undefined,
  env?: Record<string, string | undefined>,
): ResolvedForgeLogLevel;
export function resolveLogLevel(
  nameOrEnv?: string | Record<string, string | undefined>,
  maybeEnv?: Record<string, string | undefined>,
): ResolvedForgeLogLevel {
  let name: string | undefined;
  let env: Record<string, string | undefined>;
  if (typeof nameOrEnv === "string") {
    name = nameOrEnv;
    env = maybeEnv ?? process.env;
  } else if (nameOrEnv !== undefined) {
    env = nameOrEnv;
  } else {
    env = maybeEnv ?? process.env;
  }

  const rawLevel = env.LOG_LEVEL;
  if (rawLevel !== undefined && rawLevel !== "") {
    const segments = rawLevel.split(",");
    let globalLevel: ForgeLogLevel | undefined;
    const overrides: Record<string, ForgeLogLevel> = {};
    let invalidValue: string | undefined;

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (trimmed === "") {
        continue;
      }
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        if (isForgeLogLevel(trimmed)) {
          globalLevel = trimmed;
        } else {
          invalidValue = invalidValue ?? trimmed;
        }
      } else {
        const segmentName = trimmed.slice(0, eqIndex).trim();
        const segmentLevel = trimmed.slice(eqIndex + 1).trim();
        if (isForgeLogLevel(segmentLevel)) {
          overrides[segmentName] = segmentLevel;
        } else {
          invalidValue = invalidValue ?? trimmed;
        }
      }
    }

    if (name !== undefined && overrides[name] !== undefined) {
      return { level: overrides[name], source: "LOG_LEVEL", invalidValue };
    }

    if (globalLevel !== undefined) {
      return { level: globalLevel, source: "LOG_LEVEL", invalidValue };
    }

    if (invalidValue !== undefined) {
      return { level: "info", source: "default", invalidValue };
    }
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

const ambientContext = new AsyncLocalStorage<Record<string, unknown>>();

export function getLogContext(): Record<string, unknown> {
  return ambientContext.getStore() ?? {};
}

export function withLogContext<T>(
  bindings: Record<string, unknown>,
  operation: () => T | Promise<T>,
): T | Promise<T> {
  const parent = ambientContext.getStore();
  const merged = parent ? { ...parent, ...bindings } : bindings;
  return ambientContext.run(merged, operation);
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

// A named type guard, not an inline condition: TypeScript can't narrow
// `readonly string[]` out of the LogFieldSelection union via Array.isArray()
// in an else-branch, so the exclusion has to be asserted explicitly here.
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

export interface ForgeInvocationLoggingOptions<T> {
  logEntry?: boolean;
  entryLevel?: "debug" | "info";
  entryMessage?: string;
  includeEventShape?: boolean;
  successLevel?: "debug" | "info";
  errorLevel?: "warn" | "error" | "fatal";
  message?: string;
  successMessage?: string;
  errorMessage?: string;
  summarizeResult?: (result: T) => Record<string, unknown>;
}

function isResult(value: unknown): value is Result<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Result<unknown, unknown>).isOk === "function" &&
    typeof (value as Result<unknown, unknown>).isErr === "function"
  );
}

export function withForgeInvocationLogging<TEvent, TResult>(
  logger: ForgeLogger,
  event: TEvent,
  handler: (event: TEvent) => TResult | Promise<TResult>,
  options?: ForgeInvocationLoggingOptions<TResult>,
): TResult | Promise<TResult> {
  const baseMetadata = summarizeForgeInvocation(event);

  if (options?.logEntry) {
    logForgeInvocation(
      logger,
      event,
      options.entryMessage ?? "invocation started",
      {
        level: options.entryLevel ?? "info",
        includeEventShape: options.includeEventShape,
      },
    );
  }

  const start = Date.now();
  const message = options?.message ?? "invocation completed";

  function logCompletion(
    level: "debug" | "info" | "warn" | "error" | "fatal",
    outcome: "success" | "failure",
    value: TResult | unknown,
    messageText?: string,
  ): void {
    const durationMs = Date.now() - start;
    const metadata: Record<string, unknown> = {
      ...baseMetadata,
      outcome,
      durationMs,
    };
    if (
      outcome === "success" &&
      options?.summarizeResult &&
      value !== undefined
    ) {
      Object.assign(metadata, options.summarizeResult(value as TResult));
    }
    logger[level](metadata, messageText ?? message);
  }

  function logFailure(error: unknown): never {
    const durationMs = Date.now() - start;
    const metadata = buildErrorMetadata(logger, error);
    Object.assign(metadata, baseMetadata, { outcome: "failure", durationMs });
    const level = options?.errorLevel ?? "error";
    logger[level](metadata, options?.errorMessage ?? message);
    throw error;
  }

  function handleReturn(value: TResult): TResult {
    if (isResult(value)) {
      if (value.isErr()) {
        const durationMs = Date.now() - start;
        const metadata = buildErrorMetadata(logger, value.error);
        Object.assign(metadata, baseMetadata, {
          outcome: "failure",
          durationMs,
        });
        const level = options?.errorLevel ?? "error";
        logger[level](metadata, options?.errorMessage ?? message);
        return value;
      }
      const resultValue = value.value as TResult;
      const successLevel = options?.successLevel ?? "info";
      logCompletion(
        successLevel,
        "success",
        resultValue,
        options?.successMessage ?? message,
      );
      return value;
    }
    const successLevel = options?.successLevel ?? "info";
    logCompletion(
      successLevel,
      "success",
      value,
      options?.successMessage ?? message,
    );
    return value;
  }

  try {
    const result = handler(event);
    if (isPromiseLike(result)) {
      return result.then(handleReturn, logFailure) as
        | TResult
        | Promise<TResult>;
    }
    return handleReturn(result);
  } catch (error) {
    return logFailure(error);
  }
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

const MAX_STACK_FRAMES = 8;
const MAX_CAUSE_DEPTH = 3;
const MAX_AGGREGATE_ERRORS = 3;

function truncateStack(stack: string): string {
  const lines = stack.split("\n");
  const frames = lines.slice(1);
  if (frames.length <= MAX_STACK_FRAMES) {
    return stack;
  }
  const kept = frames.slice(0, MAX_STACK_FRAMES);
  const omitted = frames.length - MAX_STACK_FRAMES;
  return [lines[0], ...kept, `... ${omitted} frames omitted`].join("\n");
}

function buildErrorMetadataSummary(
  logger: ForgeLogger,
  error: unknown,
  status?: number,
): Record<string, unknown> {
  const problemDetails = toProblemDetails(error, status ?? 500);
  const metadata = approvedProblemFields(problemDetails);
  if (error instanceof Error) {
    metadata.errorName = error.name;
    if (error.stack && isVerboseLevelEnabled(logger)) {
      metadata.stack = truncateStack(error.stack);
    }
  }
  return metadata;
}

function buildErrorMetadata(
  logger: ForgeLogger,
  error: unknown,
  status?: number,
): Record<string, unknown> {
  const metadata = buildErrorMetadataSummary(logger, error, status);

  if (
    error instanceof Error &&
    error.cause !== undefined &&
    error.cause !== null
  ) {
    const visited = new Set<unknown>();
    const causes: unknown[] = [];
    let current: unknown = error.cause;
    while (
      causes.length < MAX_CAUSE_DEPTH &&
      current !== undefined &&
      current !== null
    ) {
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      causes.push(buildErrorMetadataSummary(logger, current, status));
      current = (current as Error).cause;
    }
    metadata.causes = causes;
  }

  if (error instanceof AggregateError) {
    metadata.errors = error.errors
      .slice(0, MAX_AGGREGATE_ERRORS)
      .map((nested) => buildErrorMetadataSummary(logger, nested, status));
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

export type DebugProbeLevel = "debug" | "trace";

export interface LogProbeOptions {
  level?: DebugProbeLevel;
  metadata?: unknown | (() => unknown);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function isProbeLevelEnabled(
  logger: ForgeLogger,
  level: DebugProbeLevel,
): boolean {
  return unwrapPinoLogger(logger).isLevelEnabled(level);
}

function resolveProbeMetadata(
  options: LogProbeOptions | undefined,
): JSONValue | undefined {
  if (options?.metadata === undefined) {
    return undefined;
  }
  const metadata =
    typeof options.metadata === "function"
      ? (options.metadata as () => unknown)()
      : options.metadata;
  return summarizeForLog(metadata);
}

function logProbeSuccess(
  logger: ForgeLogger,
  label: string,
  value: unknown,
  level: DebugProbeLevel,
  options: LogProbeOptions | undefined,
): void {
  if (!isProbeLevelEnabled(logger, level)) {
    return;
  }
  const debugProbe: Record<string, unknown> = {
    label,
    value: summarizeForLog(value),
  };
  const metadata = resolveProbeMetadata(options);
  if (metadata !== undefined) {
    debugProbe.metadata = metadata;
  }
  logger[level]({ debugProbe });
}

function logProbeError(
  logger: ForgeLogger,
  label: string,
  error: unknown,
  level: DebugProbeLevel,
  options: LogProbeOptions | undefined,
): void {
  if (!isProbeLevelEnabled(logger, level)) {
    return;
  }
  const debugProbe: Record<string, unknown> = {
    label,
    error: buildErrorMetadata(logger, error),
  };
  const metadata = resolveProbeMetadata(options);
  if (metadata !== undefined) {
    debugProbe.metadata = metadata;
  }
  logger[level]({ debugProbe });
}

export function logProbe<T>(
  logger: ForgeLogger,
  label: string,
  valueOrThunk: T | (() => T),
  options?: LogProbeOptions,
): T {
  const level = options?.level ?? "debug";
  let result: T;
  try {
    result =
      typeof valueOrThunk === "function"
        ? (valueOrThunk as () => T)()
        : valueOrThunk;
  } catch (thrown) {
    logProbeError(logger, label, thrown, level, options);
    throw thrown;
  }
  if (isPromiseLike(result)) {
    return result.then(
      (fulfilled) => {
        logProbeSuccess(logger, label, fulfilled, level, options);
        return fulfilled;
      },
      (rejected) => {
        logProbeError(logger, label, rejected, level, options);
        throw rejected;
      },
    ) as T;
  }
  logProbeSuccess(logger, label, result, level, options);
  return result;
}

export type LogMethod = (
  obj: Record<string, unknown> | string | (() => Record<string, unknown>),
  message?: string,
) => void;

export interface ForgeLoggerOptions {
  name?: string;
  env?: Record<string, string | undefined>;
  redact?: pino.LoggerOptions["redact"];
  base?: pino.LoggerOptions["base"];
  pretty?: boolean;
}

export interface ForgeLogger {
  fatal: LogMethod;
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  trace: LogMethod;
  log(
    level: Exclude<ForgeLogLevel, "silent">,
    obj: Record<string, unknown> | string | (() => Record<string, unknown>),
    message?: string,
  ): void;
  isLevelEnabled(level: ForgeLogLevel): boolean;
  child(bindings: Record<string, unknown>): ForgeLogger;
  forgeInvocation(
    event: unknown,
    message?: string,
    options?: ForgeInvocationLogOptions,
  ): void;
  invocation<TEvent, TResult>(
    event: TEvent,
    handler: (event: TEvent) => TResult | Promise<TResult>,
    options?: ForgeInvocationLoggingOptions<TResult>,
  ): TResult | Promise<TResult>;
  result<T, E = ProblemDetails>(
    result: Result<T, E>,
    options?: LogResultOptions<T, E>,
  ): void;
  errorResult(error: unknown, options?: LogErrorOptions): void;
  probe<T>(
    label: string,
    valueOrThunk: T | (() => T),
    options?: LogProbeOptions,
  ): T;
}

const underlyingPinoLoggers = new WeakMap<ForgeLogger, pino.Logger>();

function resolveLogCall(
  obj: Record<string, unknown> | string | (() => Record<string, unknown>),
  level: ForgeLogLevel,
  pinoLogger: pino.Logger,
): { obj: Record<string, unknown>; message?: string } {
  let resolved: Record<string, unknown> | string;
  if (typeof obj === "function") {
    if (!pinoLogger.isLevelEnabled(level)) {
      return { obj: {} };
    }
    resolved = obj();
  } else {
    resolved = obj;
  }

  const ambient = getLogContext();
  const base = pinoLogger.bindings();
  if (typeof resolved === "string") {
    return { obj: { ...ambient, ...base }, message: resolved };
  }
  return { obj: { ...ambient, ...base, ...resolved } };
}

function logWithLevel(
  pinoLogger: pino.Logger,
  level: ForgeLogLevel,
  obj: Record<string, unknown> | string | (() => Record<string, unknown>),
  message: string | undefined,
): void {
  const resolved = resolveLogCall(obj, level, pinoLogger);
  pinoLogger[level](resolved.obj, message ?? resolved.message);
}

function wrapPinoLogger(pinoLogger: pino.Logger): ForgeLogger {
  const forgeLogger: ForgeLogger = {
    fatal: (obj, message) => logWithLevel(pinoLogger, "fatal", obj, message),
    error: (obj, message) => logWithLevel(pinoLogger, "error", obj, message),
    warn: (obj, message) => logWithLevel(pinoLogger, "warn", obj, message),
    info: (obj, message) => logWithLevel(pinoLogger, "info", obj, message),
    debug: (obj, message) => logWithLevel(pinoLogger, "debug", obj, message),
    trace: (obj, message) => logWithLevel(pinoLogger, "trace", obj, message),
    log: (level, obj, message) => {
      if (!isForgeLogLevel(level)) {
        return;
      }
      forgeLogger[level](obj, message);
    },
    isLevelEnabled: (level) => pinoLogger.isLevelEnabled(level),
    child: (bindings) => wrapPinoLogger(pinoLogger.child(bindings)),
    forgeInvocation: (event, message, options) =>
      logForgeInvocation(forgeLogger, event, message, options),
    invocation: (event, handler, options) =>
      withForgeInvocationLogging(forgeLogger, event, handler, options),
    result: (result, options) => logResult(forgeLogger, result, options),
    errorResult: (error, options) => logError(forgeLogger, error, options),
    probe: (label, valueOrThunk, options) =>
      logProbe(forgeLogger, label, valueOrThunk, options),
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

const CONSOLE_METHOD_BY_LEVEL_LABEL: Readonly<
  Record<string, "error" | "warn" | "info" | "debug">
> = {
  fatal: "error",
  error: "error",
  warn: "warn",
  info: "info",
  debug: "debug",
  trace: "debug",
};

function consoleMethodForLevel(
  levelNumber: number,
): "error" | "warn" | "info" | "debug" {
  const label = pino.levels.labels[levelNumber];
  return CONSOLE_METHOD_BY_LEVEL_LABEL[label] ?? "info";
}

interface ForgeDestination extends pino.DestinationStream {
  lastLevel: number;
}

// `forge logs` captures output by intercepting the platform's `console.*`
// methods, the way Forge's own docs instruct apps to log -- it does not tail
// the process's raw stdout file descriptor. A synchronous SonicBoom
// destination writes bytes straight to fd 1, which never reaches Forge's log
// capture regardless of sync vs. async. Opting into pino's metadata contract
// (the `needsMetadataGsym` symbol) makes pino set `lastLevel` on this object
// immediately before each `write()` call, so every line can be dispatched to
// the console method matching its severity.
function createForgeDestination(): pino.DestinationStream {
  const destination: ForgeDestination = {
    lastLevel: pino.levels.values.info,
    write(chunk: string): void {
      const line = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;
      console[consoleMethodForLevel(destination.lastLevel)](line);
    },
  };
  (destination as unknown as Record<symbol, boolean>)[
    pino.symbols.needsMetadataGsym
  ] = true;
  return destination;
}

function formatPrettyValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatPrettyLine(chunk: string): string {
  const record = JSON.parse(chunk) as Record<string, unknown>;
  const timestamp = new Date(record.time as number).toISOString();
  const level = String(record.level).toUpperCase();
  const message = String(record.msg ?? "");
  const fields = Object.entries(record)
    .filter(([key]) => key !== "time" && key !== "level" && key !== "msg")
    .map(([key, value]) => `${key}=${formatPrettyValue(value)}`)
    .join(" ");
  return fields.length > 0
    ? `${timestamp} ${level} ${message} ${fields}`
    : `${timestamp} ${level} ${message}`;
}

function createPrettyDestination(
  destination: pino.DestinationStream,
): pino.DestinationStream {
  const wrapper: ForgeDestination = {
    get lastLevel(): number {
      return (destination as ForgeDestination).lastLevel;
    },
    set lastLevel(value: number) {
      (destination as ForgeDestination).lastLevel = value;
    },
    write(chunk: string): void {
      const line = formatPrettyLine(chunk);
      destination.write(line);
    },
  };
  (wrapper as unknown as Record<symbol, boolean>)[
    pino.symbols.needsMetadataGsym
  ] = true;
  return wrapper;
}

function isPrettyEnabled(
  options: ForgeLoggerOptions,
  env: Record<string, string | undefined>,
): boolean {
  return options.pretty === true || env.FORGE_LOG_PRETTY === "true";
}

export function createForgeLogger(
  options: ForgeLoggerOptions = {},
  destination: pino.DestinationStream = createForgeDestination(),
): ForgeLogger {
  const env = options.env ?? process.env;
  const { level } = resolveLogLevel(options.name, env);
  const effectiveDestination = isPrettyEnabled(options, env)
    ? createPrettyDestination(destination)
    : destination;
  const pinoLogger = pino(
    {
      level,
      name: options.name,
      base: options.base ?? {},
      redact: withDefaultRedaction(options.redact),
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
    effectiveDestination,
  );
  return wrapPinoLogger(pinoLogger);
}

let defaultLogger: ForgeLogger | undefined;

function getDefaultLogger(): ForgeLogger {
  if (defaultLogger === undefined) {
    defaultLogger = createForgeLogger();
  }
  return defaultLogger;
}

/**
 * A ready-to-use default logger. It is created on first use, not at import
 * time, so `LOG_LEVEL` resolution is not frozen before the consuming
 * environment can read Forge variables.
 */
export const log: ForgeLogger = new Proxy({} as ForgeLogger, {
  get(_target, prop) {
    return (getDefaultLogger() as unknown as Record<string | symbol, unknown>)[
      prop
    ];
  },
});
