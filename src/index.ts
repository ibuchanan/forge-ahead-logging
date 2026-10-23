import type { ProblemDetails, Result } from "@forge-ahead/errors";
import pino from "pino";
import { getLogContext } from "./context.js";
import { createForgeDestination, formatDestination } from "./destination.js";
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
import {
  type ForgeLogLevel,
  isForgeLogLevel,
  resolveLogLevel,
} from "./level.js";
import type { LogProbeOptions } from "./probe.js";
import { logProbe } from "./probe.js";
import { redactLogRecord, withDefaultRedaction } from "./redaction.js";
import { summarizeForLog } from "./summarize.js";
import type { LogInput, LogLevelMethods, LogMethod } from "./types.js";

export { installConsoleCapture } from "./console.js";
export { getLogContext, withLogContext } from "./context.js";
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
  type ForgeLogLevel,
  type ForgeLogLevelSource,
  getLogLevel,
  type ResolvedForgeLogLevel,
  resolveLogLevel,
} from "./level.js";
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
export type { LogMethod, MinimalLogger } from "./types.js";

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

export interface ForgeLogger extends LogLevelMethods {
  log(
    level: Exclude<ForgeLogLevel, "silent">,
    obj: LogInput,
    message?: string,
    ...args: unknown[]
  ): void;
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

// Hidden, non-enumerable handle from a ForgeLogger to its pino logger. The
// default-logger proxy forwards symbol reads, so it needs no registration.
const INTERNALS = Symbol("forgeLoggerInternals");

type RecordMetadata = (() => Record<string, unknown>) | undefined;

function buildRecordMetadata(
  recordMetadata: RecordMetadata,
  pinoLogger: pino.Logger,
  level: ForgeLogLevel,
): Record<string, unknown> {
  if (!recordMetadata || !pinoLogger.isLevelEnabled(level)) {
    return {};
  }
  try {
    return summarizeForLog(recordMetadata()) as Record<string, unknown>;
  } catch {
    return { recordMetadataError: true };
  }
}

function logWithLevel(
  pinoLogger: pino.Logger,
  recordMetadata: RecordMetadata,
  level: ForgeLogLevel,
  input: LogInput,
  message: string | undefined,
  args: unknown[],
): void {
  if (!pinoLogger.isLevelEnabled(level)) return;
  const value = typeof input === "function" ? input() : input;
  // A leading string is the format, so an explicit message becomes its first argument.
  const { fields, format, formatArgs } =
    typeof value === "string"
      ? { fields: {}, format: value, formatArgs: [message, ...args] }
      : { fields: value, format: message, formatArgs: args };
  const record = redactLogRecord(
    pinoLogger.bindings(),
    buildRecordMetadata(recordMetadata, pinoLogger, level),
    getLogContext(),
    fields,
  );
  pinoLogger[level](record, format, ...formatArgs);
}

function wrapPinoLogger(
  pinoLogger: pino.Logger,
  recordMetadata: RecordMetadata,
): ForgeLogger {
  const method =
    (level: ForgeLogLevel): LogMethod =>
    (obj, message, ...args) =>
      logWithLevel(pinoLogger, recordMetadata, level, obj, message, args);
  const forgeLogger: ForgeLogger = {
    fatal: method("fatal"),
    error: method("error"),
    warn: method("warn"),
    info: method("info"),
    debug: method("debug"),
    trace: method("trace"),
    log: (level, obj, message, ...args) => {
      if (!isForgeLogLevel(level)) {
        return;
      }
      forgeLogger[level](obj, message, ...args);
    },
    isLevelEnabled: (level) => pinoLogger.isLevelEnabled(level),
    child: (bindings) =>
      wrapPinoLogger(
        pinoLogger.child(redactLogRecord(bindings)),
        recordMetadata,
      ),
    forgeInvocation: (event, message, options) =>
      logForgeInvocation(forgeLogger, event, message, options),
    invocation: (event, handler, options) =>
      withForgeInvocationLogging(forgeLogger, event, handler, options),
    result: (result, options) => logResult(forgeLogger, result, options),
    errorResult: (error, options) => logError(forgeLogger, error, options),
    probe: (label, valueOrThunk, options) =>
      logProbe(forgeLogger, label, valueOrThunk, options),
  };
  Object.defineProperty(forgeLogger, INTERNALS, {
    value: { pino: pinoLogger },
  });
  return forgeLogger;
}

export function unwrapPinoLogger(logger: ForgeLogger): pino.Logger {
  const internals = (
    logger as { [INTERNALS]?: { pino: pino.Logger } } | undefined
  )?.[INTERNALS];
  if (!internals) {
    throw new Error("Expected a ForgeLogger created by createForgeLogger().");
  }
  return internals.pino;
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
  const effectiveDestination = formatDestination(
    destination,
    isPrettyEnabled(options, env),
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
  return wrapPinoLogger(pinoLogger, options.recordMetadata);
}

let defaultLogger: ForgeLogger | undefined;

export function configureForgeLogger(options: ForgeLoggerOptions): void {
  defaultLogger = createForgeLogger(options);
}

function getDefaultLogger(): ForgeLogger {
  defaultLogger ??= createForgeLogger();
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
