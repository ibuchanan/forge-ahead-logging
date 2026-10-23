import type { ProblemDetails } from "@forge-ahead/errors";
import { isProblemDetails } from "@forge-ahead/errors";
import type { ForgeLogger } from "./index.js";
import type { LogObjectSummaryPolicy } from "./policy.js";
import { summarizeObjectForLog } from "./policy.js";

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
    metadata.errorName = error.name;
  }
  if (status !== undefined) {
    metadata.status = status;
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

export function buildErrorMetadata(
  _logger: ForgeLogger,
  error: unknown,
  status?: number,
  errorPolicy?: LogObjectSummaryPolicy,
): Record<string, unknown> {
  if (errorPolicy) {
    return { ...summarizeObjectForLog(error, errorPolicy), outcome: "failure" };
  }
  const metadata = buildErrorMetadataSummary(error, status);

  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    error.cause !== undefined &&
    error.cause !== null
  ) {
    const visited = new Set<unknown>();
    const causes: unknown[] = [];
    let current: unknown = error.cause;
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
    metadata.causes = causes;
  }

  if (error instanceof AggregateError) {
    metadata.errors = error.errors
      .slice(0, MAX_AGGREGATE_ERRORS)
      .map((nested) => buildErrorMetadataSummary(nested));
  }

  return metadata;
}
