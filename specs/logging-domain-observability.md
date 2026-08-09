# Mini-Spec: `@forge-ahead/logging` — Domain-error aware observability

## Context

`@forge-ahead/logging` provides a rich `ForgeLogger` built on `pino`, with
helpers for summarizing objects, redacting secrets, and logging Forge
invocations. The current `logResult` helper, however, assumes errors are
ProblemDetails. When a project uses `{ code: "domain-error" }` style errors
(common in `neverthrow`-based domain cores), `logResult` wraps them in a
500 ProblemDetails and loses the `code` field.

The Supplychain Graph project therefore logs `Result` errors manually:

```typescript
if (result.isErr()) {
  logger.info(
    { event: "scg.demo.pairing.seed.failed", reason: result.error.code, role },
    "Supplychain Graph demo pairing seed failed",
  );
  return errorResponse(409, { error: result.error.code });
}
```

This pattern appears in several webtrigger and automation action handlers.

Additionally, domain observability code does not want to depend on the full
`ForgeLogger` type. The project defines a tiny local interface:

```typescript
export interface DomainEventLogger {
  readonly info: (fields: Record<string, unknown>, message: string) => void;
}
```

This keeps the domain core decoupled from logging implementation details.

## Problem

- `logger.result()` is not usable for the project's primary error model.
- Every handler re-implements the "log the error code" step.
- Every project defines its own minimal logger interface.

## Goal

Make two small additions to `@forge-ahead/logging`:

1. `logger.result()` / `buildErrorMetadata` should detect `{ code: string }`
   domain errors and log them as structured metadata rather than wrapping them
   as generic 500 errors.
2. Export a standard `MinimalLogger` (or `DomainEventLogger`) interface so
   projects can depend on a small upstream contract instead of defining their
   own.

## Proposed API

### 1. Domain-error recognition in error metadata

Update `buildErrorMetadata` so that when the error is not a `ProblemDetails`
but is a plain object with a `code` string, the logged metadata includes the
`code` field instead of a synthesized 500 ProblemDetails.

Behavior:

- If `isProblemDetails(error)` returns `true`, keep the current behavior.
- If `error` is a non-null object with `typeof error.code === "string"`, the
  metadata should include:
  - `errorCode: error.code`
  - `title` as a fallback if the error also has a `message` string.
  - Any other own enumerable properties (except the message used for title),
    summarized by `summarizeForLog`.
- Otherwise, keep the current fallback to `StandardError.getOrDefault(500)`.

Example logged output for `{ code: "invalid-seed-request" }`:

```json
{
  "level": "error",
  "msg": "Supplychain Graph demo pairing seed failed",
  "errorCode": "invalid-seed-request"
}
```

### 2. Minimal logger interface

Add a new type export to the main package:

```typescript
export interface MinimalLogger {
  readonly info: LogMethod;
  readonly error: LogMethod;
  readonly warn?: LogMethod;
  readonly debug?: LogMethod;
}
```

Where `LogMethod` is the existing method type from the package:

```typescript
export type LogMethod = (
  obj: Record<string, unknown> | string | (() => Record<string, unknown>),
  message?: string,
  ...args: unknown[]
) => void;
```

`ForgeLogger` should already satisfy `MinimalLogger` (and `MinimalLogger` should
be a supertype of `ForgeLogger` minus the extra methods). This lets domain
observability functions accept a `MinimalLogger` without importing the full
`ForgeLogger`.

## Implementation sketch

### Domain-error detection

```typescript
function isDomainError(error: unknown): error is { code: string } & Record<string, unknown> {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

function buildErrorMetadata(
  logger: ForgeLogger,
  error: unknown,
  status?: number,
): Record<string, unknown> {
  if (isProblemDetails(error)) {
    return approvedProblemFields(toProblemDetails(error, status));
  }

  if (isDomainError(error)) {
    const metadata: Record<string, unknown> = {
      errorCode: error.code,
    };
    if (typeof error.message === "string") {
      metadata.title = error.message;
    }
    // Summarize any remaining fields without leaking full Error stacks.
    for (const [key, value] of Object.entries(error)) {
      if (key === "code" || key === "message") continue;
      metadata[key] = summarizeForLog(value);
    }
    return metadata;
  }

  // Existing path for strings, Error instances, and unknown values.
  return buildErrorMetadataSummary(logger, error, status);
}
```

The exact shape may need refinement to avoid logging overly large objects.
Only own enumerable properties should be considered, and nested values should
be summarized by `summarizeForLog`.

### MinimalLogger interface

Add near the `LogMethod` export:

```typescript
export interface MinimalLogger {
  readonly info: LogMethod;
  readonly error: LogMethod;
  readonly warn?: LogMethod;
  readonly debug?: LogMethod;
}
```

And optionally a type assertion test that `ForgeLogger` is assignable to
`MinimalLogger`:

```typescript
const _typeCheck: MinimalLogger = {} as ForgeLogger;
```

## Acceptance criteria

- [ ] `buildErrorMetadata` recognises `{ code: string }` objects.
- [ ] When logging a `{ code: string }` error, the output record contains
      `errorCode` with the value of `error.code`.
- [ ] When logging a `{ code: string, message: string }` error, the output also
      contains `title`.
- [ ] Additional own enumerable properties on the error object are summarized
      and included.
- [ ] Existing ProblemDetails errors still produce the same output as before.
- [ ] Existing `Error` instance and unknown-value fallbacks still produce the
      same output as before.
- [ ] A `MinimalLogger` interface is exported from the main package entry.
- [ ] A type-check test asserts that `ForgeLogger` extends `MinimalLogger`.
- [ ] `npm run check` passes (format, lint, typecheck, tests, build).
- [ ] Documentation in `README.md` is updated with the new behavior.

## Usage example

### Domain-error logging

Before:

```typescript
if (result.isErr()) {
  logger.info(
    { event: "scg.demo.pairing.seed.failed", reason: result.error.code, role },
    "Supplychain Graph demo pairing seed failed",
  );
  return errorResponse(409, { error: result.error.code });
}
```

After:

```typescript
logger.result(result, {
  errorMessage: "Supplychain Graph demo pairing seed failed",
  errorLevel: "info",
  summarizeErr: (error) => ({ event: "scg.demo.pairing.seed.failed", role }),
});

if (result.isErr()) {
  return errorResponse(409, { error: result.error.code });
}
```

### MinimalLogger port

```typescript
import type { MinimalLogger } from "@forge-ahead/logging";

export interface GraphPublishResultEvent {
  readonly correlationId: string;
  readonly sourceEpicId: string;
  readonly status: "failed" | "indexed" | "suppressed";
  readonly reason?: string;
}

export function logGraphPublishResult(
  logger: MinimalLogger,
  event: GraphPublishResultEvent,
): void {
  logger.info(
    {
      correlationId: event.correlationId,
      event: "scg.graph.publish.completed",
      reason: event.reason,
      sourceEpicId: event.sourceEpicId,
      status: event.status,
    },
    "Supplychain Graph package publish completed",
  );
}
```

## Non-goals

- Do not remove or deprecate `ProblemDetails` support.
- Do not add matchers or test assertions to this package.
- Do not log full stack traces for domain errors.
- Do not treat `code` on `Error` instances specially unless the error also
  matches the `{ code: string }` shape.

## Dependencies

- Existing `summarizeForLog` and `isProblemDetails` / `toProblemDetails` helpers.
- No new runtime dependencies.

## Risks / open questions

- Should the helper also recognise `{ code: string, detail: string }` as a
  domain error and map `detail` to the `msg`? No; the message is caller-provided
  through `logResult` options.
- Should the summary depth for extra error fields be limited? Yes, reuse
  `summarizeForLog` with its default options.
- Should `MinimalLogger` include `trace` or `fatal`? Keep it minimal: `info`,
  `error`, and optional `warn`/`debug`. Callers can widen the type if needed.
