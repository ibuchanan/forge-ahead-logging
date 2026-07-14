import {
  err,
  errAsync,
  fromAsyncThrowable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
  ok,
  okAsync,
  type Result,
  ResultAsync,
  safeTry,
} from "neverthrow";

// Re-export neverthrow essentials so consumers don't need dual imports.
// Result instance methods such as map, mapErr, and match remain available on Result values.
export {
  err,
  errAsync,
  fromAsyncThrowable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
  ok,
  okAsync,
  type Result,
  ResultAsync,
  safeTry,
};

/**
 * RFC 9457: Problem Details for HTTP APIs
 * https://www.rfc-editor.org/rfc/rfc9457.html
 *
 * This interface implements RFC 9457, which defines a standard format for
 * HTTP API error responses. Each field serves a specific purpose:
 *
 * - type: A URI reference that identifies the problem type (e.g., https://httpstatuses.io/404)
 * - title: A short, human-readable summary of the problem type (e.g., "Not Found")
 * - status: The HTTP status code (e.g., 404, 500)
 * - detail: A human-readable explanation specific to this occurrence of the problem
 * - timestamp: ISO 8601 timestamp when the problem occurred
 * - instance: (Optional) A URI reference that identifies the specific occurrence of the problem
 *
 * This format allows APIs to provide consistent, machine-readable error responses
 * that can be easily consumed by clients while remaining human-readable.
 */
export interface ProblemDetails {
  type: string; // URI reference identifying the problem type
  title: string; // Human-readable summary of the problem type
  status: number; // HTTP status code
  detail: string; // Human-readable explanation specific to this occurrence
  timestamp: string; // ISO 8601 timestamp
  instance?: string; // Optional URI reference identifying this specific occurrence
}

/**
 * Standard HTTP error class that creates RFC 9457 compliant error responses
 * wrapped in neverthrow Results.
 *
 * This class maintains a registry of standard HTTP error types and provides
 * methods to create error Results with consistent ProblemDetails formatting.
 *
 * @example
 * ```typescript
 * // Create an error Result
 * return StandardError.getOrDefault(404).error("File not found");
 *
 * // Extract ProblemDetails from Result for logging
 * const result = StandardError.getOrDefault(500).error("Server error");
 * console.error(result.error);
 * ```
 */
export class StandardError {
  /**
   * The HTTP status code for this error type (e.g., 404, 500)
   * @readonly
   */
  readonly status: number;

  /**
   * Human-readable title for this error type (e.g., "Not Found", "Internal Server Error")
   * @readonly
   */
  readonly title: string;

  /**
   * Static registry of pre-registered error types mapped by status code
   * @static
   */
  static types = new Map<number, StandardError>();

  /**
   * Create a new StandardError instance
   *
   * @param status - HTTP status code
   * @param title - Human-readable error title
   */
  constructor(status: number, title: string) {
    this.status = status;
    this.title = title;
  }

  /**
   * Register a new error type in the static registry
   *
   * @param status - HTTP status code to register
   * @param title - Human-readable title for this error type
   *
   * @example
   * ```typescript
   * StandardError.add(404, "Not Found");
   * StandardError.add(500, "Internal Server Error");
   * ```
   */
  static add(status: number, title: string) {
    StandardError.types.set(status, new StandardError(status, title));
  }

  /**
   * Get a registered error type by status code, or default to 500 if not found
   *
   * This method is safe to call with any status code. If the code is not
   * registered, it returns a 500 Internal Server Error instance.
   *
   * @param statusCode - HTTP status code to look up
   * @returns StandardError instance for the given code or 500 default
   *
   * @example
   * ```typescript
   * // Get registered error
   * const notFound = StandardError.getOrDefault(404);
   *
   * // Get unregistered error (returns 500)
   * const teapot = StandardError.getOrDefault(418); // Returns 500 error
   * ```
   */
  static getOrDefault(statusCode: number): StandardError {
    return (
      StandardError.types.get(statusCode) ??
      StandardError.types.get(500) ??
      new StandardError(500, "Internal Server Error")
    );
  }

  /**
   * Map HTTP status code to appropriate shell exit code
   *
   * Any error (4xx or 5xx) results in exit code 1, indicating the CLI
   * encountered an error condition that prevented successful completion.
   * Success (2xx) should not use this method.
   *
   * @param statusCode - HTTP status code (unused, always returns 1)
   * @returns Shell exit code 1 for any error
   *
   * @example
   * ```typescript
   * const result = StandardError.getOrDefault(404).error("Not found");
   * if (result.isErr()) {
   *   process.exit(StandardError.toExitCode(result.error.status));
   * }
   * ```
   */
  static toExitCode(_statusCode: number): number {
    return 1;
  }

  /**
   * Get the RFC 9457 type URI for this error
   *
   * Returns a URI reference to httpstatuses.io for the error's status code.
   * This provides a stable, machine-readable identifier for the error type.
   *
   * @returns URI string in format `https://httpstatuses.io/{status}`
   *
   * @example
   * ```typescript
   * const error = StandardError.getOrDefault(404);
   * console.log(error.type); // "https://httpstatuses.io/404"
   * ```
   */
  public get type() {
    return `https://httpstatuses.io/${this.status}`;
  }
  /**
   * Create a Result containing an error with RFC 9457 ProblemDetails
   *
   * This is the primary method for creating error Results in this project.
   * It wraps a ProblemDetails object in a neverthrow Result.err().
   *
   * @param message - Human-readable explanation specific to this error occurrence
   * @param timestamp - Optional ISO 8601 timestamp (defaults to current time if not provided)
   * @param instance - Optional URI reference identifying this specific error occurrence
   * @returns Result.err containing ProblemDetails with all error information
   *
   * @example
   * ```typescript
   * // Basic error
   * return StandardError.getOrDefault(404).error("File not found");
   *
   * // Error with instance URI for tracing
   * return StandardError.getOrDefault(404).error(
   *   "User not found",
   *   undefined,
   *   "/api/users/123"
   * );
   *
   * // Error with custom timestamp
   * const customTime = "2024-01-15T10:30:00.000Z";
   * return StandardError.getOrDefault(500).error("Server error", customTime);
   * ```
   */
  error(
    message: string,
    timestamp?: string,
    instance?: string,
  ): Result<never, ProblemDetails> {
    const problemDetails: ProblemDetails = {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: message,
      instance: instance,
      timestamp: timestamp ?? new Date().toISOString(),
    };
    return err(problemDetails);
  }
}

// Pre-register every 4xx/5xx status code in the IANA HTTP Status Code
// Registry (https://www.iana.org/assignments/http-status-codes/) so
// downstream clients get a complete starting set rather than only the
// handful this project happened to need first. Titles follow RFC 9110
// where it renamed a reason phrase (e.g. 422 "Unprocessable Content",
// 413 "Content Too Large"). 418 is intentionally omitted: RFC 9110
// §15.5.19 reserves it as "(Unused)" and defines no semantics for it.
StandardError.add(400, "Bad Request");
StandardError.add(401, "Unauthorized");
StandardError.add(402, "Payment Required");
StandardError.add(403, "Forbidden");
StandardError.add(404, "Not Found");
StandardError.add(405, "Method Not Allowed");
StandardError.add(406, "Not Acceptable");
StandardError.add(407, "Proxy Authentication Required");
StandardError.add(408, "Request Timeout");
StandardError.add(409, "Conflict");
StandardError.add(410, "Gone");
StandardError.add(411, "Length Required");
StandardError.add(412, "Precondition Failed");
StandardError.add(413, "Content Too Large");
StandardError.add(414, "URI Too Long");
StandardError.add(415, "Unsupported Media Type");
StandardError.add(416, "Range Not Satisfiable");
StandardError.add(417, "Expectation Failed");
StandardError.add(421, "Misdirected Request");
StandardError.add(422, "Unprocessable Content");
StandardError.add(423, "Locked");
StandardError.add(424, "Failed Dependency");
StandardError.add(425, "Too Early");
StandardError.add(426, "Upgrade Required");
StandardError.add(428, "Precondition Required");
StandardError.add(429, "Too Many Requests");
StandardError.add(431, "Request Header Fields Too Large");
StandardError.add(451, "Unavailable For Legal Reasons");
StandardError.add(500, "Internal Server Error");
StandardError.add(501, "Not Implemented");
StandardError.add(502, "Bad Gateway");
StandardError.add(503, "Service Unavailable");
StandardError.add(504, "Gateway Timeout");
StandardError.add(505, "HTTP Version Not Supported");
StandardError.add(506, "Variant Also Negotiates");
StandardError.add(507, "Insufficient Storage");
StandardError.add(508, "Loop Detected");
StandardError.add(510, "Not Extended");
StandardError.add(511, "Network Authentication Required");

/**
 * Standard shell exit codes
 * https://tldp.org/LDP/abs/html/exitcodes.html
 *
 * For our CLI applications:
 * - Exit with 0 on success
 * - Exit with 1 for any error (4xx or 5xx - prevents shell script continuation)
 *
 * This map documents standard POSIX shell exit codes for reference.
 */
/**
 * A single field-level validation error.
 */
export interface ValidationError {
  field: string;
  reason: string;
  message: string;
}

/**
 * RFC 9457 ProblemDetails extended with a list of field-level validation errors.
 */
export interface ValidationProblemDetails extends ProblemDetails {
  errors: ValidationError[];
}

/**
 * Type guard that checks whether an unknown value conforms to the ProblemDetails shape.
 *
 * @param error - Any unknown value (typically from a catch block)
 * @returns `true` if the value has all required ProblemDetails fields with the correct types
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   if (isProblemDetails(e)) {
 *     console.error(e.detail); // type-safe access
 *   }
 * }
 * ```
 */
export function isProblemDetails(error: unknown): error is ProblemDetails {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as Partial<ProblemDetails>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.detail === "string" &&
    typeof candidate.timestamp === "string"
  );
}

/**
 * Extracts a human-readable message from any thrown value.
 *
 * Handles ProblemDetails, Error instances, plain strings, and unknown values,
 * returning a safe fallback for anything else.
 *
 * @param error - Any unknown value (typically from a catch block)
 * @returns The most specific human-readable message available
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   console.error(toErrorMessage(e));
 * }
 * ```
 */
export function toErrorMessage(error: unknown): string {
  if (isProblemDetails(error)) {
    return error.detail;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return "An unexpected error occurred.";
}

/**
 * Converts any thrown value into a ProblemDetails object.
 *
 * If the value already is a ProblemDetails it passes through unchanged.
 * Otherwise a new ProblemDetails is created using StandardError for the
 * given status code and the message extracted by toErrorMessage.
 *
 * @param error - Any unknown value (typically from a catch block)
 * @param status - HTTP status code to use when creating a new ProblemDetails (default: 500)
 * @returns A ProblemDetails object
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   return err(toProblemDetails(e, 503));
 * }
 * ```
 */
export function toProblemDetails(error: unknown, status = 500): ProblemDetails {
  if (isProblemDetails(error)) {
    return error;
  }
  const result = StandardError.getOrDefault(status).error(
    toErrorMessage(error),
  );
  if (result.isErr()) {
    return result.error;
  }
  throw new Error("Expected StandardError.error to return an error Result.");
}

/**
 * Wraps any thrown value as a neverthrow `err(ProblemDetails)`.
 *
 * Convenience function for early-return patterns in Result-style code.
 * Combines toProblemDetails and err() into a single call.
 *
 * @param error - Any unknown value (typically from a catch block)
 * @param status - HTTP status code to use when creating a new ProblemDetails (default: 500)
 * @returns `Result.err` containing a ProblemDetails
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   return problemResult(e, 503);
 * }
 * ```
 */
export function problemResult<T = never>(
  error: unknown,
  status = 500,
): Result<T, ProblemDetails> {
  return err(toProblemDetails(error, status));
}

export const ShellExitCodes = new Map<number, string>([
  [0, "Success"],
  [1, "Catchall for general errors"],
  [2, "Misuse of shell builtins"],
  [126, "Command invoked cannot execute"],
  [127, "Command not found"],
  [128, "Invalid argument to exit"],
  [130, "Script terminated by Control-C"],
  // 128+n, Fatal error signal "n": $PPID of script returns 137 (128 + 9)
  // 255*, Exit status out of range: exit takes only integer args in the range 0 - 255
]);
