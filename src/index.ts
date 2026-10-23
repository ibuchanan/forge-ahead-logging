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
    lastLevel: pino.levels.values.info,
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
