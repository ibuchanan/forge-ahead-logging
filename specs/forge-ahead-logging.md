# Forge Logging Library Extraction Spec

## Status

Draft.

## Goal

Extract the current `forge-ahead` logging helpers into a standalone TypeScript
package that is to logging what `@forge-ahead/errors` is to error handling:
a small, opinionated, Forge-oriented wrapper around a proven runtime library.

The package wraps `pino`, keeps structured logging as the primary interface, and
ships Forge-specific helpers that reduce log bloat, avoid customer-data leaks,
and make production debug logging opt-in through a declared Forge variable.

## Repository Scope

This repository owns only the standalone `@forge-ahead/logging` package:

- library source, tests, README, and package metadata
- specs for downstream work in other packages

This repository must not directly change `forge-ahead`, `repo-init`,
`forge-prelint`, app templates, or monorepo package wiring. Work needed in those
packages should be written as follow-up specs that can be applied in their
own repositories.

## Package

Proposed package name:

```json
{
  "name": "@forge-ahead/logging"
}
```

Runtime dependencies:

- `pino`
- `@forge-ahead/errors`, as a direct runtime dependency

Development dependencies should mirror `@forge-ahead/errors`: TypeScript 5.x,
`tsdown`, Vitest, Biome, and Node 22 types.

The package is ESM-only, targets Node 22 or newer, and initially remains private
unless the broader Forge Ahead package publication story changes.

## Source Inputs

Current source behavior to preserve or supersede:

- `packages/forge-ahead/src/forge/logging.ts`
- `packages/forge-ahead/test/forge/logging.test.ts`
- `packages/forge-ahead/src/forge/api/apiRoute.ts`
- `packages/forge-ahead/test/api/apiRoute.test.ts`
- `packages/errors/src/errors.ts`
- `packages/errors/README.md`
- `packages/repo-init/templates/secretspec/secretspec.toml`
- `packages/repo-init/templates/scripts/forge-vars-from-secretspec.sh`
- `packages/forge-prelint/rules/ecosol/forge-scripts/use-forge-variables-set-secretspec.yml`

## Non-Goals

- Do not replace Forge invocation metrics.
- Do not invent a general observability framework.
- Do not log raw Atlassian product payloads by default.
- Do not make debug logging enabled in production unless `LOG_LEVEL` explicitly
  permits it.
- Do not require consumers to import `pino` directly for normal usage.

## Public API

### Logger Construction

```ts
export type ForgeLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
export type ForgeLogLevelSource = "LOG_LEVEL" | "NODE_ENV" | "default";

export interface ResolvedForgeLogLevel {
  level: ForgeLogLevel;
  source: ForgeLogLevelSource;
  invalidValue?: string;
}

export interface ForgeLoggerOptions {
  name?: string;
  env?: Record<string, string | undefined>;
  redact?: pino.LoggerOptions["redact"];
  base?: pino.LoggerOptions["base"];
}

export function createForgeLogger(options?: ForgeLoggerOptions): ForgeLogger;
export function getLogLevel(env?: Record<string, string | undefined>): ForgeLogLevel;
export function resolveLogLevel(env?: Record<string, string | undefined>): ResolvedForgeLogLevel;
```

`createForgeLogger()` returns a pino-backed logger with Forge-safe defaults.
It resolves its level from `options.env` when supplied, otherwise from
`process.env`. `resolveLogLevel()` reads `LOG_LEVEL` from the supplied
environment object or `process.env` and returns resolution metadata.
`getLogLevel()` is a convenience wrapper that returns only
`resolveLogLevel(...).level`.

Log level resolution order is:

1. Valid `LOG_LEVEL`.
2. `debug` when `NODE_ENV` is `development`.
3. `info` otherwise.

Allowed `LOG_LEVEL` values are the `ForgeLogLevel` union. Invalid values must
fall back to `info` with `source: "default"` and `invalidValue` set. Logger
construction should not emit a warning record as a side effect.

`ForgeLoggerOptions` must not include a direct `level` override. Runtime
verbosity is controlled through `LOG_LEVEL`; tests and scripts can pass
`options.env` without mutating `process.env`.

### Logger Shape

```ts
export interface ForgeLogger {
  fatal: LogMethod;
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  trace: LogMethod;
  child(bindings: Record<string, unknown>): ForgeLogger;
  result<T, E = ProblemDetails>(result: Result<T, E>, options?: LogResultOptions<T, E>): void;
  errorResult(error: unknown, options?: LogErrorOptions): void;
  forgeInvocation(event: unknown, message?: string, options?: ForgeInvocationLogOptions): void;
  object(
    value: unknown,
    policy: LogObjectSummaryPolicy,
    message?: string,
    options?: LogObjectSummaryOptions,
  ): void;
}

export type LogMethod = (obj: Record<string, unknown>, message?: string) => void;
```

The logger exposes pino-like level methods, but package docs should recommend
object-first calls. The `ForgeLogger` wrapper does not expose string-only level
methods. Consumers that need raw pino call shapes can use `unwrapPinoLogger()`.
When there is no useful metadata, callers should pass `{}` explicitly.

`child(bindings)` passes bindings directly through to pino child logger
bindings. It does not summarize bindings first. Consumers should use child
bindings only for stable correlation fields such as module keys, request IDs,
and operation names, not raw payloads or secrets.

`createForgeLogger()` accepts pino `base` fields, but defaults `base` to
`undefined`/`null` so pino does not add noisy process or hostname fields unless
the caller opts in. It does not accept construction-time `bindings`. Use
`logger.child(bindings)` for correlation fields.

When `createForgeLogger({ name })` is supplied, the pino logger should include
that stable logger name in emitted records.

### Pino Access

```ts
export function unwrapPinoLogger(logger: ForgeLogger): pino.Logger;
```

This escape hatch exists for integration with libraries that require a pino
instance. Normal app code should not need it.

## Default Pino Configuration

`createForgeLogger()` should configure pino with a conservative default
`redact` list as a best-effort backstop. This list is not expected to be a
complete model of every Forge or Atlassian payload. The primary leak-prevention
mechanism is still allow-list logging through Object Summary Policies, Field
Transforms, and Forge invocation summaries.

Initial default redacted paths:

```ts
export const DEFAULT_REDACT_PATHS = [
  "*.authorization",
  "*.Authorization",
  "*.cookie",
  "*.Cookie",
  "*.set-cookie",
  "*.Set-Cookie",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.contextToken",
  "*.jwt",
  "*.apiKey",
  "*.api_key",
  "*.password",
  "*.secret",
  "*.clientSecret",
  "*.client_secret",
  "authorization",
  "Authorization",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  "headers.set-cookie",
  "headers.Set-Cookie",
  "contextToken",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "apiKey",
  "api_key",
  "password",
  "secret",
  "clientSecret",
  "client_secret"
];
```

Default redaction value:

```ts
export const DEFAULT_REDACTION_CENSOR = "[redacted]";
```

The default pino configuration should set `redact.remove` to `false` so log
records retain field shape while removing values. Tests should verify the
default redaction paths cover representative secret-shaped fields, not claim
complete coverage of every platform payload.

A helper must exist to merge custom paths with defaults:

```ts
export function withDefaultRedaction(
  redact?: pino.LoggerOptions["redact"],
): pino.LoggerOptions["redact"];
```

`withDefaultRedaction()` means "defaults plus caller additions". The unresolved
API decision for version 1 is that `createForgeLogger({ redact })` also merges
caller redaction with defaults. There is no default-replacement mode in version
1; add an explicit replacement option later only if a concrete need appears.

## LOG_LEVEL Forge Variable

The package assumes a Forge runtime variable named `LOG_LEVEL`.

Rules:

- `LOG_LEVEL` is non-secret.
- Valid values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and
  `silent`.
- Production apps should normally use `info`, `warn`, or `error`.
- `debug` and `trace` are allowed for short-lived diagnostics but must be
  explicit Forge variables, not code defaults.
- No second production guard is required. If production `LOG_LEVEL` is
  explicitly set to `debug` or `trace`, the logger honors it.

`debug` is effectively a no-op in production when `LOG_LEVEL` is absent because
the default level is `info`. This should be tested by asserting that a logger
created without `LOG_LEVEL` does not emit debug records.

### SecretSpec Integration

Downstream `repo-init` work should add `LOG_LEVEL` to `secretspec.toml`:

```toml
[profiles.default]
LOG_LEVEL = { description = "Forge logger level (fatal, error, warn, info, debug, trace, silent)", default = "info" }
```

The variable push script should publish `LOG_LEVEL` with
`forge:variables:set`, not `forge:variables:set-encrypted`, because it does not
contain `SECRET`.

The placeholder prelint rule
`use-forge-variables-set-secretspec` should become active once the variable-push
contract is finalized. It should require Forge projects using
`@forge-ahead/logging` to provide a secretspec-managed path for pushing
`LOG_LEVEL` to Forge runtime variables.

Acceptance criteria:

- This package documents the required `LOG_LEVEL` Forge variable.
- Follow-up work for `repo-init`, `forge-prelint`, and old `forge-ahead`
  re-exports is captured in `specs/downstream-integration-work.md`.

## Result and Error Helpers

The package must integrate directly with `@forge-ahead/errors`, rather than
only accepting structural error payloads. This keeps `ProblemDetails` detection
and unknown-error normalization consistent with the companion errors package.

```ts
export interface LogResultOptions<T, E> {
  message?: string;
  successMessage?: string;
  errorMessage?: string;
  successLevel?: "debug" | "info";
  errorLevel?: "warn" | "error";
  summarizeOk?: (value: T) => Record<string, unknown>;
  summarizeErr?: (error: E) => Record<string, unknown>;
}

export interface LogErrorOptions {
  message?: string;
  level?: "warn" | "error" | "fatal";
  status?: number;
}

export function logResult<T, E = ProblemDetails>(
  logger: ForgeLogger,
  result: Result<T, E>,
  options?: LogResultOptions<T, E>,
): void;

export function logError(
  logger: ForgeLogger,
  error: unknown,
  options?: LogErrorOptions,
): void;
```

Behavior:

- `Result.ok` logs at `debug` by default, not `info`, to avoid high-volume
  success logs becoming a cost issue.
- `Result.ok` values are never logged raw. Without `summarizeOk`, success logs
  include only a generic success marker. With `summarizeOk`, the returned
  metadata is merged into log metadata after normal summary/redaction handling.
- `Result.err` logs at `error` by default.
- `Result.err` values are normalized to `ProblemDetails` first and are never
  logged raw by default. With `summarizeErr`, the returned metadata is added
  after normal summary/redaction handling.
- `ProblemDetails` errors log only `type`, `title`, `status`, `detail`,
  `instance`, and `timestamp`.
- Unknown thrown values are normalized through `toProblemDetails()` from
  `@forge-ahead/errors`.
- `Error` instances log `name`, `message`, and an optional stack only when
  `LOG_LEVEL` enables `debug` or `trace`.
- Non-`ProblemDetails` `Error` instances should include `errorName` alongside
  normalized `ProblemDetails` fields. Stack traces remain gated by effective
  `debug` or `trace` level.
- The old `forge-ahead` `logResult(result, label?)` console helper should not
  be implemented by this package. New code should use
  `logger.result(result, options)` or `logResult(logger, result, options)`.
  Callers on noisy paths can skip success logging by not calling
  `logger.result()` for those paths or by choosing explicit result logging
  options.

## Forge Invocation Helpers

Forge invocation helpers should be built on the generic Object Summary Policy
mechanism. They know the common field paths found on Forge invocation-like
objects, but they should not require or import a Forge invocation TypeScript
interface. The helpers accept `unknown`, omit missing fields, and summarize
best-effort.

```ts
export const FORGE_EVENT_SUMMARY_POLICY: LogObjectSummaryPolicy;

export interface ForgeInvocationLogOptions extends LogValueSummaryOptions {
  level?: "debug" | "info";
  includeEventShape?: boolean;
}

export function summarizeForgeInvocation(
  event: unknown,
  options?: LogValueSummaryOptions,
): Record<string, unknown>;

export function logForgeInvocation(
  logger: ForgeLogger,
  event: unknown,
  message?: string,
  options?: ForgeInvocationLogOptions,
): void;
```

Summary fields to promote when present:

- `eventType`
- `method`
- `path`
- `requestId`
- `context.cloudId` as `cloudId`
- `context.moduleKey` as `moduleKey`
- `call.functionKey` as `functionKey`
- `app.id` as `appId`
- `app.version` as `appVersion`
- `selfGenerated`
- bounded `queryParameters`

The implementation should obtain these fields through
`FORGE_EVENT_SUMMARY_POLICY` and `summarizeObjectForLog()`, not through a
separate hand-coded object traversal.

By default, `summarizeForgeInvocation()` includes only policy-selected fields.
It must not include a bounded copy of the full event shape unless
`includeEventShape: true` is explicitly set and the effective logger level is
`debug` or `trace`. The opt-in event shape must still go through
`summarizeForLog()`. If `includeEventShape: true` is requested at `info` or a
more restrictive level, the helper should omit the event shape and include
`eventShapeOmitted: "requires debug or trace"`.

Fields that must not be logged raw:

- `body`
- `headers`
- `contextToken`
- authorization/cookie/token/secret-like fields
- full product payload branches such as `issue`, `comment`, `page`, `space`,
  `user`, and `account`

`body` and `headers` should be represented as shape summaries, for example:

```json
{
  "body": { "omitted": true, "length": 2481 },
  "headers": { "omitted": true, "keys": 31 }
}
```

## Object Summary Policies

The package must provide a general way to log rich domain objects without
logging their raw shape. Builds, deployments, issues, comments, pages, users,
groups, and project objects are examples of where this helps, not the complete
design space.

The core abstraction is an allow-list policy that projects an unknown object
into a small, stable, JSON-safe summary:

```ts
export type LogFieldPath = string | readonly string[];
export type LogFieldTransform =
  | "identity"
  | "redact"
  | "tokenPreview"
  | "omittedShape";

export type LogFieldSelection =
  | LogFieldPath
  | {
      path: LogFieldPath;
      transform?: LogFieldTransform;
    };

export type LogFieldMap = Readonly<Record<string, LogFieldSelection>>;

export interface LogObjectSummaryPolicy {
  kind: string;
  fields: LogFieldMap;
  labels?: LogFieldMap;
}

export interface LogObjectSummaryOptions extends LogValueSummaryOptions {
  includeLabels?: boolean;
}

export function defineLogObjectSummaryPolicy(
  policy: LogObjectSummaryPolicy,
): LogObjectSummaryPolicy;

export function summarizeObjectForLog(
  value: unknown,
  policy: LogObjectSummaryPolicy,
  options?: LogObjectSummaryOptions,
): Record<string, unknown>;
```

Rules:

- `fields` are included by default and should favor stable identifiers,
  workflow state, sequence numbers, routing fields, and other operational
  correlation fields.
- `labels` are excluded by default and require `includeLabels: true`. Labels are
  fields that are useful to humans but may contain human-authored or
  customer-identifying text, such as display names, titles, summaries, branch
  names, descriptions, or email addresses.
- Missing fields are omitted rather than emitted as `undefined`.
- Extracted values are passed through `summarizeForLog()` so budgets, circular
  handling, and secret-shaped-key redaction still apply.
- A policy must never include raw content branches by default, such as request
  bodies, comments, descriptions, document/page bodies, arbitrary properties,
  avatars, icons, or unbounded payload blobs.
- Policy entries are data-only alias-to-selection mappings in the first
  version. A selection is either a path or a path plus one of the library's
  built-in transforms.
- Custom extractor functions are intentionally excluded until real use shows
  that built-in transforms cannot express an important case safely.
- Version 1 ships the generic policy mechanism only. Domain-specific policy
  presets for issues, builds, deployments, users, groups, or other object kinds
  should be added later only after repeated usage patterns emerge.

Example:

```ts
const deploymentPolicy = defineLogObjectSummaryPolicy({
  kind: "deployment",
  fields: {
    deploymentSequenceNumber: "deploymentSequenceNumber",
    updateSequenceNumber: "updateSequenceNumber",
  },
  labels: {
    displayName: "displayName",
  },
});

summarizeObjectForLog(deployment, deploymentPolicy);
```

Default output keeps operational identifiers:

```json
{
  "kind": "deployment",
  "deploymentSequenceNumber": 42,
  "updateSequenceNumber": 7
}
```

Opt-in label output may include human-readable names:

```ts
summarizeObjectForLog(deployment, deploymentPolicy, { includeLabels: true });
```

The package may ship useful Forge/Atlassian policy presets later, but the
generic policy mechanism is the version 1 API.

### Field Transforms

Built-in transforms cover proven logging cases without accepting arbitrary
callbacks:

| Transform | Behavior |
| --- | --- |
| `identity` | Summarize the selected value with `summarizeForLog()`; this is the default. |
| `redact` | Emit `"[redacted]"` when the selected value is present. |
| `tokenPreview` | For a string, emit the first three and last three characters separated by `...`; for other present values, emit `"[redacted]"`. |
| `omittedShape` | Emit only shape metadata such as `{ omitted: true, length: 2481 }`, `{ omitted: true, keys: 31 }`, or `{ omitted: true, items: 5 }`. |

### Forge Event Policy Example

The Forge invocation helper should use this exported object summary policy:

```ts
export const FORGE_EVENT_SUMMARY_POLICY = defineLogObjectSummaryPolicy({
  kind: "forgeEvent",
  fields: {
    eventType: "eventType",
    method: "method",
    path: "path",
    requestId: "requestId",
    cloudId: "context.cloudId",
    moduleKey: "context.moduleKey",
    functionKey: "call.functionKey",
    appId: "app.id",
    appVersion: "app.version",
    selfGenerated: "selfGenerated",
    queryParameters: "queryParameters",
    contextToken: {
      path: "contextToken",
      transform: "tokenPreview",
    },
    headers: {
      path: "headers",
      transform: "omittedShape",
    },
    body: {
      path: "body",
      transform: "omittedShape",
    },
  },
});
```

For example:

```ts
summarizeObjectForLog(
  {
    contextToken: "1234567890",
    headers: { authorization: "Bearer secret", cookie: "sid=abc" },
    body: "{\"secret\":\"payload\"}",
  },
  FORGE_EVENT_SUMMARY_POLICY,
);
```

Should produce:

```json
{
  "kind": "forgeEvent",
  "contextToken": "123...890",
  "headers": { "omitted": true, "keys": 2 },
  "body": { "omitted": true, "length": 20 }
}
```

## Bounded Value Summaries

The existing `summarizeForLog()` concept remains as a standalone utility.

```ts
export interface LogValueSummaryOptions {
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
  redactedKeys?: readonly string[];
}

export function summarizeForLog(
  value: unknown,
  options?: LogValueSummaryOptions,
): JSONValue;
```

Default budget:

```ts
export const DEFAULT_LOG_VALUE_SUMMARY_OPTIONS = {
  maxDepth: 3,
  maxArrayItems: 5,
  maxObjectKeys: 12,
  maxStringLength: 240,
  redactedKeys: []
};
```

Required behavior:

- Output is JSON-safe.
- Circular references become `"[circular]"`.
- Functions, symbols, `undefined`, and bigint values become string markers.
- Long strings are truncated with omitted character count.
- Arrays retain at most `maxArrayItems` plus an omitted-items marker.
- Objects retain at most `maxObjectKeys` plus an omitted-keys marker.
- `body` and `headers` are summarized, not traversed.
- Secret-shaped keys are redacted case-insensitively.

## Compatibility

This package does not provide module-compatibility exports for the old
`forge-ahead` logging module. It should not export old console-oriented helpers
such as `truncateEvents()` or `logContext()`.

## Tests

Unit tests must cover:

- `createForgeLogger()` applies default pino redaction.
- `ForgeLogger` level methods require object-first calls at the TypeScript API
  level.
- Custom redaction paths merge with defaults in both `withDefaultRedaction()`
  and `createForgeLogger({ redact })`.
- `LOG_LEVEL` absent in production defaults to `info`.
- `debug` emits no record when effective level is `info`.
- `LOG_LEVEL=debug` emits debug records.
- Invalid `LOG_LEVEL` falls back to `info`.
- `resolveLogLevel()` reports `source` and `invalidValue` without logging a
  warning as a side effect.
- `logResult()` logs ok results at debug by default.
- `logResult()` logs err results at error by default.
- `logError()` normalizes `Error`, string, unknown, and existing
  `ProblemDetails` values.
- `logError()` includes `errorName` for `Error` instances.
- Error stack traces are omitted unless debug/trace is enabled.
- Forge invocation summaries promote routing fields.
- Web trigger `body`, `headers`, and `contextToken` are not logged raw.
- Forge event policy examples map `contextToken` through `tokenPreview` and
  `headers`/`body` through `omittedShape`.
- `includeEventShape: true` includes full bounded event shape only at effective
  `debug` or `trace` levels.
- `includeEventShape: true` at `info` or higher emits
  `eventShapeOmitted: "requires debug or trace"` instead of event data.
- Object summary policy transforms support token previews, omitted shape
  summaries, redaction, and identity summaries.
- Product trigger payloads do not log Jira summary, comment body, display name,
  email address, or arbitrary content fields.
- Object summary policies keep stable identifiers by default.
- Object summary policy labels are omitted unless explicitly enabled.
- Bounded summary options cap depth, arrays, object keys, and string length.
- Output remains JSON-serializable for circular and non-JSON inputs.

Downstream integration/template tests are specified in
`specs/downstream-integration-work.md`.

## README Requirements

The new package README should mirror `@forge-ahead/errors`:

- Package purpose.
- Why this exists for Forge.
- Minimal setup.
- Basic usage with `createForgeLogger()`.
- Result/error logging examples.
- Forge invocation logging example.
- Object summary policy example.
- API surface summary.
- Project layout.
- Development commands.

The README should avoid recommending raw `console.*` calls.

## Acceptance Criteria

- A standalone package can be created from this spec without depending on
  internal `forge-ahead` paths.
- Consumers can create a pino-backed Forge logger with one import.
- Default logger configuration redacts common secret fields.
- Debug logging is disabled in production unless `LOG_LEVEL` explicitly enables
  it.
- The package documents the `LOG_LEVEL` Forge variable contract, while
  downstream SecretSpec/template/prelint work is tracked separately.
- Results and thrown errors from `@forge-ahead/errors` log in a consistent,
  structured shape.
- Forge invocation helpers prevent raw event, body, header, context token, and
  customer-content logging by default.
- Tests specify the safety and cost-control behavior before extraction begins.
