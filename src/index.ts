import type { ProblemDetails, Result } from "@forge-ahead/errors";
import { isProblemDetails } from "@forge-ahead/errors";
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

function summarizeShapeForLog(
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
  /** @deprecated Do not preview authorization data. Use redact or omit the field. */
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

/** Options for explicit application projections; verbosity never authorizes labels. */
export interface LogObjectSummaryOptions extends LogValueSummaryOptions {
  /** Include the policy's reviewed labels at this call site; environment toggles do not enable them. */
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
  _env: Record<string, string | undefined> = process.env,
): Record<string, unknown> {
  const resolvedOptions: Required<LogValueSummaryOptions> = {
    ...DEFAULT_LOG_VALUE_SUMMARY_OPTIONS,
    ...options,
  };
  const includeLabels = options?.includeLabels === true;
  const labels =
    includeLabels && policy.labels
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
    requestId: "requestId",
    moduleKey: "context.moduleKey",
    functionKey: "call.functionKey",
    appId: "app.id",
    appVersion: "app.version",
    selfGenerated: "selfGenerated",
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
  env: Record<string, string | undefined> = process.env,
): Record<string, unknown> {
  return summarizeObjectForLog(event, FORGE_EVENT_SUMMARY_POLICY, options, env);
}

export interface ForgeInvocationLogOptions extends LogValueSummaryOptions {
  level?: "debug" | "info";
  includeEventShape?: boolean;
}

function isVerboseLevelEnabled(logger: ForgeLogger): boolean {
  return unwrapPinoLogger(logger).isLevelEnabled("debug");
}

function computeEventShape(
  logger: ForgeLogger,
  event: unknown,
  options: ForgeInvocationLogOptions | undefined,
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  const isVerbose = isVerboseLevelEnabled(logger);
  if (options?.includeEventShape !== undefined) {
    if (options.includeEventShape) {
      return isVerbose
        ? { eventShape: summarizeShapeForLog(event, options) }
        : { eventShapeOmitted: "requires debug or trace" };
    }
    return {};
  }
  if (env.FORGE_LOG_EVENT_SHAPE === "true" && isVerbose) {
    return { eventShape: summarizeShapeForLog(event, options) };
  }
  return {};
}

export function logForgeInvocation(
  logger: ForgeLogger,
  event: unknown,
  message?: string,
  options?: ForgeInvocationLogOptions,
  env: Record<string, string | undefined> = process.env,
): void {
  const summary = summarizeForgeInvocation(event, options, env);
  Object.assign(summary, computeEventShape(logger, event, options, env));
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
  errorPolicy?: LogObjectSummaryPolicy;
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
    const metadata = buildErrorMetadata(
      logger,
      error,
      undefined,
      options?.errorPolicy,
    );
    Object.assign(metadata, baseMetadata, { outcome: "failure", durationMs });
    const level = options?.errorLevel ?? "error";
    logger[level](metadata, options?.errorMessage ?? message);
    throw error;
  }

  function handleReturn(value: TResult): TResult {
    if (isResult(value)) {
      if (value.isErr()) {
        const durationMs = Date.now() - start;
        const metadata = buildErrorMetadata(
          logger,
          value.error,
          undefined,
          options?.errorPolicy,
        );
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
  errorPolicy?: LogObjectSummaryPolicy;
}

function approvedProblemFields(
  problemDetails: ProblemDetails,
): Record<string, unknown> {
  return {
    type: problemDetails.type,
    status: problemDetails.status,
    outcome: "failure",
  };
}

const MAX_CAUSE_DEPTH = 3;
const MAX_AGGREGATE_ERRORS = 3;

function buildErrorMetadataSummary(
  error: unknown,
  status?: number,
): Record<string, unknown> {
  if (isProblemDetails(error)) {
    return approvedProblemFields(error);
  }
  if (isDomainError(error)) {
    return buildDomainErrorMetadata(error);
  }
  const metadata: Record<string, unknown> = { outcome: "failure" };
  if (error instanceof Error) {
    metadata.errorName = error.name;
  }
  if (status !== undefined) {
    metadata.status = status;
  }
  return metadata;
}

function isDomainError(
  error: unknown,
): error is { code: string } & Record<string, unknown> {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

function buildDomainErrorMetadata(
  error: { code: string } & Record<string, unknown>,
): Record<string, unknown> {
  return { errorCode: error.code, outcome: "failure" };
}

function buildErrorMetadata(
  _logger: ForgeLogger,
  error: unknown,
  status?: number,
  errorPolicy?: LogObjectSummaryPolicy,
): Record<string, unknown> {
  if (errorPolicy) {
    return { ...summarizeObjectForLog(error, errorPolicy), outcome: "failure" };
  }
  const metadata = buildErrorMetadataSummary(error, status);

  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
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
      causes.push(buildErrorMetadataSummary(current));
      current = (current as Error).cause;
    }
    metadata.causes = causes;
  }

  if (error instanceof AggregateError) {
    metadata.errors = error.errors
      .slice(0, MAX_AGGREGATE_ERRORS)
      .map((nested) => buildErrorMetadataSummary(nested));
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
  const metadata = buildErrorMetadata(
    logger,
    result.error,
    undefined,
    options?.errorPolicy,
  );
  if (options?.summarizeErr) {
    Object.assign(metadata, options.summarizeErr(result.error));
  }
  logger[level](metadata, options?.errorMessage ?? options?.message);
}

export interface LogErrorOptions {
  message?: string;
  level?: "warn" | "error" | "fatal";
  status?: number;
  errorPolicy?: LogObjectSummaryPolicy;
}

export function logError(
  logger: ForgeLogger,
  error: unknown,
  options?: LogErrorOptions,
): void {
  const level = options?.level ?? "error";
  const metadata = buildErrorMetadata(
    logger,
    error,
    options?.status,
    options?.errorPolicy,
  );
  logger[level](metadata, options?.message);
}

export type DebugProbeLevel = "debug" | "trace";

/** Probe diagnostics are structural unless an application explicitly selects values. */
export interface LogProbeOptions {
  level?: DebugProbeLevel;
  /** Structural by default; lazy callbacks run only when the requested level is enabled. */
  metadata?: unknown | (() => unknown);
  /** Reviewed value projection replacing the structural successful-value summary. */
  valuePolicy?: LogObjectSummaryPolicy;
  /** Reviewed projection replacing structural probe-only metadata. */
  metadataPolicy?: LogObjectSummaryPolicy;
  errorPolicy?: LogObjectSummaryPolicy;
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
): JSONValue | Record<string, unknown> | undefined {
  if (options?.metadata === undefined) {
    return undefined;
  }
  const metadata =
    typeof options.metadata === "function"
      ? (options.metadata as () => unknown)()
      : options.metadata;
  return options.metadataPolicy
    ? summarizeObjectForLog(metadata, options.metadataPolicy)
    : summarizeShapeForLog(metadata);
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
  try {
    const debugProbe: Record<string, unknown> = {
      label,
      value: options?.valuePolicy
        ? summarizeObjectForLog(value, options.valuePolicy)
        : summarizeShapeForLog(value),
    };
    const metadata = resolveProbeMetadata(options);
    if (metadata !== undefined) {
      debugProbe.metadata = metadata;
    }
    logger[level]({ debugProbe });
  } catch {
    // Probe-only diagnostics must not change the application outcome.
  }
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
  try {
    const debugProbe: Record<string, unknown> = {
      label,
      error: buildErrorMetadata(logger, error, undefined, options?.errorPolicy),
    };
    const metadata = resolveProbeMetadata(options);
    if (metadata !== undefined) {
      debugProbe.metadata = metadata;
    }
    logger[level]({ debugProbe });
  } catch {
    // Preserve the original application failure, not a diagnostic failure.
  }
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
  ...args: unknown[]
) => void;

/**
 * A small upstream logger contract for domain observability code that does not
 * want to depend on the full `ForgeLogger` interface.
 */
export interface MinimalLogger {
  readonly info: LogMethod;
  readonly error: LogMethod;
  readonly warn?: LogMethod;
  readonly debug?: LogMethod;
}

export type ForgeTimestampFormat = "epoch" | "iso";

export interface ForgeLoggerOptions {
  name?: string;
  env?: Record<string, string | undefined>;
  redact?: pino.LoggerOptions["redact"];
  base?: pino.LoggerOptions["base"];
  pretty?: boolean;
  recordMetadata?: () => Record<string, unknown>;
  timestamp?: ForgeTimestampFormat;
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
    ...args: unknown[]
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
const recordMetadataByPinoLogger = new WeakMap<
  pino.Logger,
  () => Record<string, unknown>
>();
let defaultLoggerProxy: ForgeLogger | undefined;

function buildRecordMetadata(
  pinoLogger: pino.Logger,
  level: ForgeLogLevel,
): Record<string, unknown> {
  const callback = recordMetadataByPinoLogger.get(pinoLogger);
  if (!callback || !pinoLogger.isLevelEnabled(level)) {
    return {};
  }
  try {
    return summarizeForLog(callback()) as Record<string, unknown>;
  } catch {
    return { recordMetadataError: true };
  }
}

function resolveLogCall(
  obj: Record<string, unknown> | string | (() => Record<string, unknown>),
  level: ForgeLogLevel,
  pinoLogger: pino.Logger,
): { obj: Record<string, unknown>; message?: string } {
  let resolved: Record<string, unknown> | string;
  if (typeof obj === "function") {
    resolved = obj();
  } else {
    resolved = obj;
  }

  const ambient = getLogContext();
  const base = pinoLogger.bindings();
  const recordMetadata = buildRecordMetadata(pinoLogger, level);
  return {
    obj: redactLogRecord(
      base,
      recordMetadata,
      ambient,
      typeof resolved === "string" ? {} : resolved,
    ),
    message: typeof resolved === "string" ? resolved : undefined,
  };
}

const MAX_REDACTION_DEPTH = 32;
const MAX_REDACTION_ENTRIES = 10_000;
const MAX_REDACTION_CHARACTERS = 1_000_000;
const REDACTION_LIMIT = Symbol("redaction limit");

function redactLogRecord(
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

function logWithLevel(
  pinoLogger: pino.Logger,
  level: ForgeLogLevel,
  obj: Record<string, unknown> | string | (() => Record<string, unknown>),
  message: string | undefined,
  args: unknown[],
): void {
  if (!pinoLogger.isLevelEnabled(level)) return;
  const resolved = resolveLogCall(obj, level, pinoLogger);
  const record = resolved.obj;
  if (typeof obj === "string") {
    pinoLogger[level](record, obj, message, ...args);
    return;
  }
  pinoLogger[level](record, message ?? resolved.message, ...args);
}

function wrapPinoLogger(pinoLogger: pino.Logger): ForgeLogger {
  const forgeLogger: ForgeLogger = {
    fatal: (obj, message, ...args) =>
      logWithLevel(pinoLogger, "fatal", obj, message, args),
    error: (obj, message, ...args) =>
      logWithLevel(pinoLogger, "error", obj, message, args),
    warn: (obj, message, ...args) =>
      logWithLevel(pinoLogger, "warn", obj, message, args),
    info: (obj, message, ...args) =>
      logWithLevel(pinoLogger, "info", obj, message, args),
    debug: (obj, message, ...args) =>
      logWithLevel(pinoLogger, "debug", obj, message, args),
    trace: (obj, message, ...args) =>
      logWithLevel(pinoLogger, "trace", obj, message, args),
    log: (level, obj, message, ...args) => {
      if (!isForgeLogLevel(level)) {
        return;
      }
      forgeLogger[level](obj, message, ...args);
    },
    isLevelEnabled: (level) => pinoLogger.isLevelEnabled(level),
    child: (bindings) => {
      const childPinoLogger = pinoLogger.child(redactLogRecord(bindings));
      const childRecordMetadata = recordMetadataByPinoLogger.get(pinoLogger);
      if (childRecordMetadata) {
        recordMetadataByPinoLogger.set(childPinoLogger, childRecordMetadata);
      }
      return wrapPinoLogger(childPinoLogger);
    },
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

// Set while the Forge logger is writing to `console.*`, so any installed
// console capture can detect logger output and route it to the original
// console methods instead of recursing back into the logger.
let isLoggerWritingToConsole = false;

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
      isLoggerWritingToConsole = true;
      console[consoleMethodForLevel(destination.lastLevel)](line);
      isLoggerWritingToConsole = false;
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

const PRIORITY_LOG_KEYS = ["level", "time", "msg"] as const;

function orderLogRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries([
    ...PRIORITY_LOG_KEYS.filter((key) => key in record).map((key) => [
      key,
      record[key],
    ]),
    ...Object.entries(record).filter(
      ([key]) =>
        !PRIORITY_LOG_KEYS.includes(key as (typeof PRIORITY_LOG_KEYS)[number]),
    ),
  ]);
}

function createOrderedDestination(
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
      const newline = chunk.endsWith("\n") ? "\n" : "";
      const line = newline ? chunk.slice(0, -1) : chunk;
      const record = JSON.parse(line) as Record<string, unknown>;
      destination.write(`${JSON.stringify(orderLogRecord(record))}${newline}`);
    },
  };
  (wrapper as unknown as Record<symbol, boolean>)[
    pino.symbols.needsMetadataGsym
  ] = true;
  return wrapper;
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

function isoTime(): string {
  return `,"time":"${new Date().toISOString()}"`;
}

function resolveTimestamp(
  options: ForgeLoggerOptions,
): pino.LoggerOptions["timestamp"] {
  return options.timestamp === "iso" ? isoTime : true;
}

function isPrettyEnabled(
  options: ForgeLoggerOptions,
  env: Record<string, string | undefined>,
): boolean {
  return options.pretty === true || env.FORGE_LOG_PRETTY === "true";
}

function formatConsoleArgs(
  level: "log" | "info" | "warn" | "error" | "debug",
  args: unknown[],
): {
  obj: Record<string, unknown>;
  message: string;
} {
  if (args.length === 0) {
    return { obj: {}, message: "" };
  }
  if (typeof args[0] === "string") {
    return {
      obj:
        args.length > 1
          ? { consoleArgs: summarizeShapeForLog(args.slice(1)) }
          : {},
      message: args[0],
    };
  }
  return {
    obj: { consoleArgs: summarizeShapeForLog(args) },
    message: `console.${level}`,
  };
}

export function installConsoleCapture(logger: ForgeLogger): () => void {
  const previous = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  console.log = (...args: unknown[]) => {
    if (isLoggerWritingToConsole) {
      return previous.log(...args);
    }
    if (!logger.isLevelEnabled("info")) return;
    const { obj, message } = formatConsoleArgs("log", args);
    logger.info(obj, message);
  };
  console.info = (...args: unknown[]) => {
    if (isLoggerWritingToConsole) {
      return previous.info(...args);
    }
    if (!logger.isLevelEnabled("info")) return;
    const { obj, message } = formatConsoleArgs("info", args);
    logger.info(obj, message);
  };
  console.warn = (...args: unknown[]) => {
    if (isLoggerWritingToConsole) {
      return previous.warn(...args);
    }
    if (!logger.isLevelEnabled("warn")) return;
    const { obj, message } = formatConsoleArgs("warn", args);
    logger.warn(obj, message);
  };
  console.error = (...args: unknown[]) => {
    if (isLoggerWritingToConsole) {
      return previous.error(...args);
    }
    if (!logger.isLevelEnabled("error")) return;
    const { obj, message } = formatConsoleArgs("error", args);
    logger.error(obj, message);
  };
  console.debug = (...args: unknown[]) => {
    if (isLoggerWritingToConsole) {
      return previous.debug(...args);
    }
    if (!logger.isLevelEnabled("debug")) return;
    const { obj, message } = formatConsoleArgs("debug", args);
    logger.debug(obj, message);
  };

  return () => {
    console.log = previous.log;
    console.info = previous.info;
    console.warn = previous.warn;
    console.error = previous.error;
    console.debug = previous.debug;
  };
}

export function createForgeLogger(
  options: ForgeLoggerOptions = {},
  destination: pino.DestinationStream = createForgeDestination(),
): ForgeLogger {
  const env = options.env ?? process.env;
  const { level } = resolveLogLevel(options.name, env);
  const effectiveDestination = createOrderedDestination(
    isPrettyEnabled(options, env)
      ? createPrettyDestination(destination)
      : destination,
  );
  const pinoLogger = pino(
    {
      level,
      name: options.name,
      base: redactLogRecord(options.base ?? {}),
      redact: withDefaultRedaction(options.redact),
      timestamp: resolveTimestamp(options),
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
    effectiveDestination,
  );
  if (options.recordMetadata) {
    recordMetadataByPinoLogger.set(pinoLogger, options.recordMetadata);
  }
  return wrapPinoLogger(pinoLogger);
}

let defaultLogger: ForgeLogger | undefined;

function setDefaultLogger(logger: ForgeLogger): void {
  defaultLogger = logger;
  const pinoLogger = underlyingPinoLoggers.get(logger);
  if (pinoLogger && defaultLoggerProxy) {
    underlyingPinoLoggers.set(defaultLoggerProxy, pinoLogger);
  }
}

export function configureForgeLogger(options: ForgeLoggerOptions): void {
  setDefaultLogger(createForgeLogger(options));
}

function getDefaultLogger(): ForgeLogger {
  if (defaultLogger === undefined) {
    setDefaultLogger(createForgeLogger());
  }
  return defaultLogger as ForgeLogger;
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

defaultLoggerProxy = log;
