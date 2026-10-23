import type { ForgeLogLevel } from "./level.js";

/** A record, a message string used as the format, or a lazy record. */
export type LogInput =
  | Record<string, unknown>
  | string
  | (() => Record<string, unknown>);

export type LogMethod = (
  obj: LogInput,
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

/**
 * The level methods that logging helpers need. Helpers depend on this leaf
 * type instead of `ForgeLogger`, so they do not import the module that
 * imports them.
 */
export interface LogLevelMethods {
  fatal: LogMethod;
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  trace: LogMethod;
  isLevelEnabled(level: ForgeLogLevel): boolean;
}
