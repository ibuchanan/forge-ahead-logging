import {
  createForgeLogger,
  type ForgeLogger,
  type ForgeLoggerOptions,
} from "./logger.js";

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
