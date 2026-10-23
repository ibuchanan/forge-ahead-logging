import pino from "pino";
import type { ForgeLogger } from "./index.js";
import { summarizeShapeForLog } from "./summarize.js";

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

/** Writes one formatted log line to the console method matching its pino level. */
export function writeLogLineToConsole(levelNumber: number, line: string): void {
  isLoggerWritingToConsole = true;
  try {
    console[consoleMethodForLevel(levelNumber)](line);
  } finally {
    isLoggerWritingToConsole = false;
  }
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

const CAPTURED_CONSOLE_METHODS = [
  ["log", "info"],
  ["info", "info"],
  ["warn", "warn"],
  ["error", "error"],
  ["debug", "debug"],
] as const;

export function installConsoleCapture(logger: ForgeLogger): () => void {
  const previous = CAPTURED_CONSOLE_METHODS.map(
    ([method]) => [method, console[method]] as const,
  );

  for (const [method, level] of CAPTURED_CONSOLE_METHODS) {
    const original = console[method];
    console[method] = (...args: unknown[]) => {
      if (isLoggerWritingToConsole) {
        return original(...args);
      }
      if (!logger.isLevelEnabled(level)) return;
      const { obj, message } = formatConsoleArgs(method, args);
      logger[level](obj, message);
    };
  }

  return () => {
    for (const [method, original] of previous) {
      console[method] = original;
    }
  };
}
