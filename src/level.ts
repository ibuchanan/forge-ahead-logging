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

export function isForgeLogLevel(value: string): value is ForgeLogLevel {
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

export interface LogLevelOptions {
  /** Logger name that selects a `name=level` override. */
  name?: string | undefined;
  /** Environment to read. Defaults to `process.env`. */
  env?: Record<string, string | undefined> | undefined;
}

export function resolveLogLevel(
  options: LogLevelOptions = {},
): ResolvedForgeLogLevel {
  const { name, env = process.env } = options;
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

export function getLogLevel(options: LogLevelOptions = {}): ForgeLogLevel {
  return resolveLogLevel(options).level;
}
