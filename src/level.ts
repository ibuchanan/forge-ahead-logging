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
