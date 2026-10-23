import { buildErrorMetadata, type ErrorPolicyOption } from "./errors.js";
import {
  type LogObjectSummaryPolicy,
  summarizeObjectForLog,
} from "./policy.js";
import { isPromiseLike } from "./promise.js";
import { type JSONValue, summarizeShapeForLog } from "./summarize.js";
import type { LogLevelMethods } from "./types.js";

export type DebugProbeLevel = "debug" | "trace";

/** Probe diagnostics are structural unless an application explicitly selects values. */
export interface LogProbeOptions extends ErrorPolicyOption {
  level?: DebugProbeLevel;
  /** Structural by default. A function is called lazily, only when the requested level is enabled. */
  metadata?: unknown;
  /** Reviewed value projection replacing the structural successful-value summary. */
  valuePolicy?: LogObjectSummaryPolicy;
  /** Reviewed projection replacing structural probe-only metadata. */
  metadataPolicy?: LogObjectSummaryPolicy;
}

function resolveProbeMetadata(
  options: LogProbeOptions | undefined,
): JSONValue | Record<string, unknown> | undefined {
  if (options?.metadata === undefined) {
    return undefined;
  }
  const metadata =
    typeof options.metadata === "function"
      ? options.metadata()
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
  logger: LogLevelMethods,
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
      debugProbe["metadata"] = metadata;
    }
    logger[level]({ debugProbe });
  } catch {
    // Intentionally ignored; see above.
  }
}

export function logProbe<T>(
  logger: LogLevelMethods,
  label: string,
  valueOrThunk: T | (() => T),
  options?: LogProbeOptions,
): T {
  const level = options?.level ?? "debug";
  const emit = (summarize: () => Record<string, unknown>): void =>
    emitProbe(logger, level, label, options, summarize);
  const logSuccess = (value: unknown): void =>
    emit(() => ({
      value: options?.valuePolicy
        ? summarizeObjectForLog(value, options.valuePolicy)
        : summarizeShapeForLog(value),
    }));
  const logFailure = (error: unknown): void =>
    emit(() => ({ error: buildErrorMetadata(error, options) }));

  let result: T;
  try {
    result =
      typeof valueOrThunk === "function"
        ? (valueOrThunk as () => T)()
        : valueOrThunk;
  } catch (thrown) {
    logFailure(thrown);
    throw thrown;
  }
  if (isPromiseLike(result)) {
    return result.then(
      (fulfilled) => {
        logSuccess(fulfilled);
        return fulfilled;
      },
      (rejected) => {
        logFailure(rejected);
        throw rejected;
      },
    ) as T;
  }
  logSuccess(result);
  return result;
}
