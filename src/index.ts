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
  });
  return wrapPinoLogger(pinoLogger);
}
