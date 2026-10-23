import pino from "pino";
import { writeLogLineToConsole } from "./console.js";

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
export function createForgeDestination(): pino.DestinationStream {
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

/**
 * Formats each log line with a single pass: pretty output already drops the
 * priority keys and keeps the rest in order, so it needs no ordered JSON first.
 */
export function formatDestination(
  destination: pino.DestinationStream,
  pretty: boolean,
): pino.DestinationStream {
  return mapDestination(
    destination,
    pretty ? formatPrettyLine : formatOrderedLine,
  );
}
