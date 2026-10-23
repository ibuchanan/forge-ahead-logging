import { buildErrorMetadata } from "./errors.js";
import type { ForgeLogger } from "./index.js";
import {
  type LogObjectSummaryPolicy,
  summarizeObjectForLog,
} from "./policy.js";
import { isPromiseLike } from "./promise.js";
import { type JSONValue, summarizeShapeForLog } from "./summarize.js";

export type DebugProbeLevel = "debug" | "trace";

/** Probe diagnostics are structural unless an application explicitly selects values. */
export interface LogProbeOptions {
  level?: DebugProbeLevel;
  /** Structural by default; lazy callbacks run only when the requested level is enabled. */
  metadata?: unknown | (() => unknown);
  /** Reviewed value projection replacing the structural successful-value summary. */
  valuePolicy?: LogObjectSummaryPolicy;
  /** Reviewed projection replacing structural probe-only metadata. */
  metadataPolicy?: LogObjectSummaryPolicy;
  errorPolicy?: LogObjectSummaryPolicy;
}

function resolveProbeMetadata(
  options: LogProbeOptions | undefined,
): JSONValue | Record<string, unknown> | undefined {
  if (options?.metadata === undefined) {
    return undefined;
  }
  const metadata =
    typeof options.metadata === "function"
      ? (options.metadata as () => unknown)()
      : options.metadata;
  return options.metadataPolicy
    ? summarizeObjectForLog(metadata, options.metadataPolicy)
    : summarizeShapeForLog(metadata);
}

/**
 * Emits one probe record. Probe-only diagnostics must never change the
 * application outcome or replace its original failure, so any error raised
 * while building or writing the record is swallowed.
 */
function emitProbe(
  logger: ForgeLogger,
  level: DebugProbeLevel,
  label: string,
  options: LogProbeOptions | undefined,
  summarize: () => Record<string, unknown>,
): void {
  if (!logger.isLevelEnabled(level)) {
    return;
  }
  try {
    const debugProbe: Record<string, unknown> = { label, ...summarize() };
    const metadata = resolveProbeMetadata(options);
    if (metadata !== undefined) {
      debugProbe.metadata = metadata;
    }
    logger[level]({ debugProbe });
  } catch {
    // Intentionally ignored; see above.
  }
}

function logProbeSuccess(
  logger: ForgeLogger,
  label: string,
  value: unknown,
  level: DebugProbeLevel,
  options: LogProbeOptions | undefined,
): void {
  emitProbe(logger, level, label, options, () => ({
    value: options?.valuePolicy
      ? summarizeObjectForLog(value, options.valuePolicy)
      : summarizeShapeForLog(value),
  }));
}

function logProbeError(
  logger: ForgeLogger,
  label: string,
  error: unknown,
  level: DebugProbeLevel,
  options: LogProbeOptions | undefined,
): void {
  emitProbe(logger, level, label, options, () => ({
    error: buildErrorMetadata(error, options),
  }));
}

export function logProbe<T>(
  logger: ForgeLogger,
  label: string,
  valueOrThunk: T | (() => T),
  options?: LogProbeOptions,
): T {
  const level = options?.level ?? "debug";
  let result: T;
  try {
    result =
      typeof valueOrThunk === "function"
        ? (valueOrThunk as () => T)()
        : valueOrThunk;
  } catch (thrown) {
    logProbeError(logger, label, thrown, level, options);
    throw thrown;
  }
  if (isPromiseLike(result)) {
    return result.then(
      (fulfilled) => {
        logProbeSuccess(logger, label, fulfilled, level, options);
        return fulfilled;
      },
      (rejected) => {
        logProbeError(logger, label, rejected, level, options);
        throw rejected;
      },
    ) as T;
  }
  logProbeSuccess(logger, label, result, level, options);
  return result;
}
