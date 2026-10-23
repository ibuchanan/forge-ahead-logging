import { AsyncLocalStorage } from "node:async_hooks";
import type { ProblemDetails, Result } from "@forge-ahead/errors";
import pino from "pino";
import { writeLogLineToConsole } from "./console.js";
import {
  type LogErrorOptions,
  type LogResultOptions,
  logError,
  logResult,
} from "./errors.js";
import {
  type ForgeInvocationLoggingOptions,
  type ForgeInvocationLogOptions,
  logForgeInvocation,
  withForgeInvocationLogging,
} from "./invocation.js";
import type { LogProbeOptions } from "./probe.js";
import { logProbe } from "./probe.js";
import { redactLogRecord, withDefaultRedaction } from "./redaction.js";
import { summarizeForLog } from "./summarize.js";

export { installConsoleCapture } from "./console.js";
export {
  type LogErrorOptions,
  type LogResultOptions,
  logError,
  logResult,
} from "./errors.js";
export {
  FORGE_EVENT_SUMMARY_POLICY,
  type ForgeInvocationLoggingOptions,
  type ForgeInvocationLogOptions,
  logForgeInvocation,
  summarizeForgeInvocation,
  withForgeInvocationLogging,
} from "./invocation.js";
export {
  defineLogObjectSummaryPolicy,
  type LogFieldMap,
  type LogFieldPath,
  type LogFieldSelection,
  type LogFieldTransform,
  type LogObjectSummaryOptions,
  type LogObjectSummaryPolicy,
  summarizeObjectForLog,
} from "./policy.js";
export {
  type DebugProbeLevel,
  type LogProbeOptions,
  logProbe,
} from "./probe.js";
export {
  DEFAULT_REDACT_PATHS,
  DEFAULT_REDACTION_CENSOR,
  withDefaultRedaction,
} from "./redaction.js";
export {
  DEFAULT_LOG_VALUE_SUMMARY_OPTIONS,
  type JSONValue,
  type LogValueSummaryOptions,
  summarizeForLog,
} from "./summarize.js";

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

function parseLogLevels(
  rawLevel: string,
  name: string | undefined,
): {
  level: ForgeLogLevel | undefined;
  invalidValue: string | undefined;
} {
  let globalLevel: ForgeLogLevel | undefined;
  let invalidValue: string | undefined;
  const overrides = new Map<string, ForgeLogLevel>();
  for (const segment of rawLevel.split(",")) {
    const trimmed = segment.trim();
    if (trimmed === "") continue;
    const eqIndex = trimmed.indexOf("=");
    const level = eqIndex === -1 ? trimmed : trimmed.slice(eqIndex + 1).trim();
    if (!isForgeLogLevel(level)) {
      invalidValue ??= trimmed;
    } else if (eqIndex === -1) {
      globalLevel = level;
    } else {
      overrides.set(trimmed.slice(0, eqIndex).trim(), level);
    }
  }
  const level =
    (name === undefined ? undefined : overrides.get(name)) ?? globalLevel;
  return { level, invalidValue };
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
  const name = typeof nameOrEnv === "string" ? nameOrEnv : undefined;
  const env =
    typeof nameOrEnv === "object" ? nameOrEnv : (maybeEnv ?? process.env);
  const { level, invalidValue } = parseLogLevels(env["LOG_LEVEL"] ?? "", name);
  if (level !== undefined) {
    return {
      level,
      source: "LOG_LEVEL",
      ...(invalidValue === undefined ? {} : { invalidValue }),
    };
  }
  if (invalidValue !== undefined) {
    return { level: "info", source: "default", invalidValue };
  }
  return env["NODE_ENV"] === "development"
    ? { level: "debug", source: "NODE_ENV" }
    : { level: "info", source: "default" };
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
): { obj: Record<string, unknown>; message: string | undefined } {
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
    lastLevel: pino.levels.values["info"] ?? 30,
    write(chunk: string): void {
      const line = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;
      writeLogLineToConsole(destination.lastLevel, line);
    },
  };
  (destination as unknown as Record<symbol, boolean>)[
    pino.symbols.needsMetadataGsym
  ] = true;
  return destination;
}

function formatPrettyValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatPrettyLine(chunk: string): string {
  const record = JSON.parse(chunk) as Record<string, unknown>;
  const timestamp = new Date(record["time"] as number).toISOString();
  const level = String(record["level"]).toUpperCase();
  const message = String(record["msg"] ?? "");
  const fields = Object.entries(record)
    .filter(([key]) => key !== "time" && key !== "level" && key !== "msg")
    .map(([key, value]) => `${key}=${formatPrettyValue(value)}`)
    .join(" ");
  return fields.length > 0
    ? `${timestamp} ${level} ${message} ${fields}`
    : `${timestamp} ${level} ${message}`;
}

const PRIORITY_LOG_KEYS = ["level", "time", "msg"] as const;

// Re-inserting the priority keys first fixes their position; the spread then
// only refreshes their values and appends everything else in original order.
function orderLogRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const priority = Object.fromEntries(
    PRIORITY_LOG_KEYS.filter((key) => key in record).map((key) => [
      key,
      record[key],
    ]),
  );
  return { ...priority, ...record };
}

function mapDestination(
  destination: pino.DestinationStream,
  format: (chunk: string) => string,
): pino.DestinationStream {
  const wrapper: ForgeDestination = {
    get lastLevel(): number {
      return (destination as ForgeDestination).lastLevel;
    },
    set lastLevel(value: number) {
      (destination as ForgeDestination).lastLevel = value;
    },
    write(chunk: string): void {
      destination.write(format(chunk));
    },
  };
  (wrapper as unknown as Record<symbol, boolean>)[
    pino.symbols.needsMetadataGsym
  ] = true;
  return wrapper;
}

function formatOrderedLine(chunk: string): string {
  const newline = chunk.endsWith("\n") ? "\n" : "";
  const line = newline ? chunk.slice(0, -1) : chunk;
  const record = JSON.parse(line) as Record<string, unknown>;
  return `${JSON.stringify(orderLogRecord(record))}${newline}`;
}

function isoTime(): string {
  return `,"time":"${new Date().toISOString()}"`;
}

function resolveTimestamp(
  options: ForgeLoggerOptions,
): (() => string) | boolean {
  return options.timestamp === "iso" ? isoTime : true;
}

function isPrettyEnabled(
  options: ForgeLoggerOptions,
  env: Record<string, string | undefined>,
): boolean {
  return options.pretty === true || env["FORGE_LOG_PRETTY"] === "true";
}

export function createForgeLogger(
  options: ForgeLoggerOptions = {},
  destination: pino.DestinationStream = createForgeDestination(),
): ForgeLogger {
  const env = options.env ?? process.env;
  const { level } = resolveLogLevel(options.name, env);
  // Pretty output already drops the priority keys and keeps the rest in order,
  // so it does not need the ordered JSON pass first.
  const effectiveDestination = mapDestination(
    destination,
    isPrettyEnabled(options, env) ? formatPrettyLine : formatOrderedLine,
  );
  const pinoLogger = pino(
    {
      level,
      ...(options.name === undefined ? {} : { name: options.name }),
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
