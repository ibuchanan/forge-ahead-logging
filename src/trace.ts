import { randomBytes } from "node:crypto";
import {
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
} from "@forge-ahead/errors";

/** OTel-compatible identifiers and flags for log correlation and propagation. */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags: number;
  /** Local parent relationship; not a separate field in the wire header. */
  readonly parentSpanId?: string;
}

/** Options for starting a trace or creating a child of an existing context. */
export interface TraceContextOptions {
  readonly parent?: TraceContext | undefined;
  /** Defaults to false for roots; children inherit their parent's sampled bit. */
  readonly sampled?: boolean;
}

function isValidId(value: unknown, length: number): value is string {
  return (
    typeof value === "string" &&
    value.length === length &&
    !/[^\da-f]/.test(value) &&
    /[1-9a-f]/.test(value)
  );
}

function isValidContext(context: TraceContext): boolean {
  return (
    context != null &&
    isValidId(context.traceId, 32) &&
    isValidId(context.spanId, 16) &&
    Number.isInteger(context.traceFlags) &&
    context.traceFlags >= 0 &&
    context.traceFlags <= 255
  );
}

function hasValidVersion(value: string, version: string | undefined): boolean {
  if (version === "ff") return false;
  return version === "00"
    ? value.length === 55
    : value.length === 55 || value[55] === "-";
}

function invalidTraceparent(): Result<never, ProblemDetails> {
  return StandardError.getOrDefault(400).error("Invalid traceparent header");
}

/**
 * Parses a W3C traceparent value; missing or invalid input returns Err.
 * The wire parent-id becomes spanId; create a child before logging local work.
 * Future versions use the known prefix only; unknown fields are not retained.
 */
export function parseTraceparent(
  header: unknown,
): Result<TraceContext, ProblemDetails> {
  if (typeof header !== "string") return invalidTraceparent();
  const value = header.replace(/^[ \t]+|[ \t]+$/g, "");
  if (/[\r\n]/.test(value)) return invalidTraceparent();
  const match = /^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})/.exec(
    value,
  );
  if (!match) return invalidTraceparent();
  const [, version, traceId, spanId, flags] = match;
  if (
    !hasValidVersion(value, version) ||
    !isValidId(traceId, 32) ||
    !isValidId(spanId, 16) ||
    flags === undefined
  ) {
    return invalidTraceparent();
  }
  return ok({ traceId, spanId, traceFlags: Number.parseInt(flags, 16) });
}

/**
 * Serializes a validated context as version 00, emitting only the sampled bit.
 * Invalid identifiers or flags return Err without exposing their values.
 */
export function formatTraceparent(
  context: TraceContext,
): Result<string, ProblemDetails> {
  if (!isValidContext(context)) {
    return StandardError.getOrDefault(400).error("Invalid trace context");
  }
  const flags = (context.traceFlags & 1).toString(16).padStart(2, "0");
  return ok(`00-${context.traceId}-${context.spanId}-${flags}`);
}

function randomId(bytes: number): string {
  let id: string;
  do {
    id = randomBytes(bytes).toString("hex");
  } while (!/[1-9a-f]/.test(id));
  return id;
}

/**
 * Creates an unsampled root or a child with a fresh cryptographically random span ID.
 * Children retain the trace ID and sampled bit without mutating their parent.
 * An explicit sampled option overrides the inherited decision for this new span.
 * Invalid parents and cryptographic generation failures return sanitized Err values.
 */
export function createTraceContext(
  options: TraceContextOptions = {},
): Result<TraceContext, ProblemDetails> {
  const { parent, sampled } = options;
  if (parent !== undefined && !isValidContext(parent)) {
    return StandardError.getOrDefault(400).error("Invalid trace context");
  }
  const traceFlags =
    sampled === undefined ? (parent?.traceFlags ?? 0) & 1 : Number(sampled);
  try {
    return ok({
      traceId: parent?.traceId ?? randomId(16),
      spanId: randomId(8),
      traceFlags,
      ...(parent === undefined ? {} : { parentSpanId: parent.spanId }),
    });
  } catch {
    return StandardError.getOrDefault(500).error(
      "Unable to generate trace IDs",
    );
  }
}
