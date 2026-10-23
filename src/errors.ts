import type { ProblemDetails, Result } from "@forge-ahead/errors";
import { isProblemDetails } from "@forge-ahead/errors";
import type { LogObjectSummaryPolicy } from "./policy.js";
import { summarizeObjectForLog } from "./policy.js";
import type { LogLevelMethods } from "./types.js";

function approvedProblemFields(
  problemDetails: ProblemDetails,
): Record<string, unknown> {
  return {
    type: problemDetails.type,
    status: problemDetails.status,
    outcome: "failure",
  };
}

const MAX_CAUSE_DEPTH = 3;
const MAX_AGGREGATE_ERRORS = 3;

function buildErrorMetadataSummary(
  error: unknown,
  status?: number,
): Record<string, unknown> {
  if (isProblemDetails(error)) {
    return approvedProblemFields(error);
  }
  if (isDomainError(error)) {
    return buildDomainErrorMetadata(error);
  }
  const metadata: Record<string, unknown> = { outcome: "failure" };
  if (error instanceof Error) {
    metadata["errorName"] = error.name;
  }
  if (status !== undefined) {
    metadata["status"] = status;
  }
  return metadata;
}

function isDomainError(
  error: unknown,
): error is { code: string } & Record<string, unknown> {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

function buildDomainErrorMetadata(
  error: { code: string } & Record<string, unknown>,
): Record<string, unknown> {
  return { errorCode: error.code, outcome: "failure" };
}

/** Per-call-site error summarizing choices shared by every error-logging option type. */
export interface ErrorSummaryOptions {
  /** Status to report for errors that do not carry their own. */
  status?: number;
  /** Reviewed projection replacing the structural error summary. */
  errorPolicy?: LogObjectSummaryPolicy;
}

function causeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error
    ? error.cause
    : undefined;
}

function buildErrorCauses(error: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const cause = causeOf(error);
  if (cause !== undefined && cause !== null) {
    const visited = new Set<unknown>();
    const causes: unknown[] = [];
    let current: unknown = cause;
    while (
      causes.length < MAX_CAUSE_DEPTH &&
      current !== undefined &&
      current !== null
    ) {
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      causes.push(buildErrorMetadataSummary(current));
      current = (current as Error).cause;
    }
    result["causes"] = causes;
  }
  if (error instanceof AggregateError) {
    result["errors"] = error.errors
      .slice(0, MAX_AGGREGATE_ERRORS)
      .map((nested) => buildErrorMetadataSummary(nested));
  }
  return result;
}

export function buildErrorMetadata(
  error: unknown,
  options?: ErrorSummaryOptions,
): Record<string, unknown> {
  if (options?.errorPolicy) {
    return {
      ...summarizeObjectForLog(error, options.errorPolicy),
      outcome: "failure",
    };
  }
  const metadata = buildErrorMetadataSummary(error, options?.status);
  Object.assign(metadata, buildErrorCauses(error));
  return metadata;
}

export interface LogResultOptions<T, E> {
  message?: string;
  successMessage?: string;
  errorMessage?: string;
  successLevel?: "debug" | "info";
  errorLevel?: "warn" | "error";
  summarizeOk?: (value: T) => Record<string, unknown>;
  summarizeErr?: (error: E) => Record<string, unknown>;
  errorPolicy?: LogObjectSummaryPolicy;
}

export function logResult<T, E = ProblemDetails>(
  logger: LogLevelMethods,
  result: Result<T, E>,
  options: LogResultOptions<T, E> = {},
): void {
  if (result.isOk()) {
    const level = options.successLevel ?? "debug";
    const metadata: Record<string, unknown> = { ok: true };
    if (options.summarizeOk) {
      Object.assign(metadata, options.summarizeOk(result.value));
    }
    logger[level](metadata, options.successMessage ?? options.message);
    return;
  }
  const level = options.errorLevel ?? "error";
  const metadata = buildErrorMetadata(result.error, options);
  if (options.summarizeErr) {
    Object.assign(metadata, options.summarizeErr(result.error));
  }
  logger[level](metadata, options.errorMessage ?? options.message);
}

export interface LogErrorOptions {
  message?: string;
  level?: "warn" | "error" | "fatal";
  status?: number;
  errorPolicy?: LogObjectSummaryPolicy;
}

export function logError(
  logger: LogLevelMethods,
  error: unknown,
  options?: LogErrorOptions,
): void {
  const level = options?.level ?? "error";
  const metadata = buildErrorMetadata(error, options);
  logger[level](metadata, options?.message);
}
