import type pino from "pino";
import {
  createForgeLogger,
  type ForgeLogger,
  type ForgeLoggerOptions,
} from "./index.js";

export interface CapturingLogger {
  logger: ForgeLogger;
  records: Record<string, unknown>[];
}

export function createCapturingLogger(
  options: ForgeLoggerOptions = {},
): CapturingLogger {
  const records: Record<string, unknown>[] = [];
  const destination: pino.DestinationStream = {
    write(chunk: string): void {
      records.push(JSON.parse(chunk));
    },
  };
  const logger = createForgeLogger(options, destination);
  return { logger, records };
}
