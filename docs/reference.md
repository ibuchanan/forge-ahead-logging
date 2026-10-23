# Reference: `@forge-ahead/logging`

This page is a lookup reference for the package’s public APIs and operational defaults. It describes behavior; it does not provide a learning path or a troubleshooting procedure.

## Package entry points

| Import | Purpose |
| --- | --- |
| `@forge-ahead/logging` | Production logger, context, summaries, invocation logging, result/error logging, and logger construction. |
| `@forge-ahead/logging/demo` | Demo Narrative Logging; intentionally separate from the production root export. |
| `@forge-ahead/logging/testing` | Capturing logger utilities for tests. |

## Log levels

`ForgeLogLevel` is one of:

| Level | Ordering |
| --- | ---: |
| `fatal` | 60 |
| `error` | 50 |
| `warn` | 40 |
| `info` | 30 |
| `debug` | 20 |
| `trace` | 10 |
| `silent` | Disabled |

`resolveLogLevel(name?, env?)` returns the selected level, its source, and invalid configuration metadata without emitting a record. `getLogLevel(...)` returns the effective level.

Resolution precedence:

1. a valid `LOG_LEVEL` value;
2. a valid `NODE_ENV` mapping;
3. the package default.

Invalid configured segments fall through to the next applicable source.

## Logger construction

### `createForgeLogger(options?, destination?)`

Creates a `ForgeLogger` backed by Pino. Relevant options include:

| Option | Meaning |
| --- | --- |
| `name` | Logger name or service identity. |
| `pretty` | Human-readable local formatting. |
| `timestamp` | `"epoch"` or `"iso"`. |
| `redact` | Additional redaction configuration. |
| `recordMetadata` | Stable fields added to records from this logger. |

### `log`

A ready-to-use default `ForgeLogger` proxy. Use it when a named logger is unnecessary.

### `configureForgeLogger(options)`

Reconfigures the default logger. Call this during application initialization, before the operation that depends on the new defaults.

### `unwrapPinoLogger(logger)`

Returns the underlying Pino logger for integrations that specifically require Pino APIs. Prefer the `ForgeLogger` interface in application code.

## Context

### `withLogContext(bindings, operation)`

Runs `operation` with ambient record bindings available to logging code across supported asynchronous boundaries.

### `getLogContext()`

Returns the current ambient context. Outside a context scope, it returns an empty record.

Context is for enrichment only. It is not a substitute for validating identity, permissions, or request authenticity.

## Value safety

### `summarizeForLog(value, options?)`

Produces a bounded, JSON-safe representation of an arbitrary value. Summary options control depth, array size, object keys, string length, and other limits.

### `withDefaultRedaction(redact?)`

Returns Pino redaction options containing the package’s default secret-shaped paths. The default censor is `[redacted]`.

### `defineLogObjectSummaryPolicy(policy)`

Defines a reusable allow-list projection for a domain object. Policies select known fields and may use built-in transforms.

### `summarizeObjectForLog(value, policy, options?)`

Projects and summarizes an object according to a `LogObjectSummaryPolicy`.

### Built-in transforms

`LogFieldTransform` supports these named, package-controlled transformations. Policies do not accept arbitrary callback functions.

| Transform | Output |
| --- | --- |
| `identity` (default) | The selected value passed through the bounded value summarizer. |
| `redact` | `[redacted]` for a present field. |
| `omittedShape` | `{ omitted: true }`, plus `length` for strings, `items` for arrays, or `keys` for objects; no field names or values are copied. |
| `tokenPreview` (deprecated for authorization data) | Compatibility only: the first three and last three characters of a string, separated by `...`; non-strings become `[redacted]`. Short strings can expose the entire value. A preview is not safe authorization-data logging. |

`tokenPreview` remains accepted by caller-supplied policies for compatibility but is not used by the built-in Forge event policy. Authorization data must be omitted or fully redacted. There is no `preview` transform.

## Forge event logging

### `summarizeForgeInvocation(event, options?)`

Returns the minimized `FORGE_EVENT_SUMMARY_POLICY` projection used by standalone invocation records and lifecycle entry/completion/failure records. Missing fields are omitted. The summary does not depend on logger redaction or the configured log level.

| Retained field | Troubleshooting purpose |
| --- | --- |
| `kind: "forgeEvent"` | Identify the record category. |
| `eventType` | Identify the Forge event subscription being handled. |
| `method` | Distinguish HTTP invocation methods. |
| `requestId` | Correlate records for a platform request, not a customer identity. |
| `moduleKey` from `context.moduleKey` | Identify the configured app module. |
| `functionKey` from `call.functionKey` | Identify the configured function. |
| `appId` from `app.id` | Identify the app, not a customer installation or tenant. |
| `appVersion` from `app.version` | Correlate behavior with a deployed app version. |
| `selfGenerated` | Diagnose app-generated event loops. |
| `headers`, `body` | `omittedShape` metadata only: presence and size/count, without names or values. |

These value-bearing fields are intended for platform/app-controlled operational metadata, not user-generated text. The summary does not automatically select Cloud, account, site, or tenant identifiers. It excludes `contextToken` (including fragments), raw paths/URLs, query keys/values, and arbitrary payload content. No route is inferred from a URL. Query parameters are omitted entirely, without a count.

**Output-contract change:** `path`, `cloudId`, `queryParameters`, and `contextToken` are no longer returned, including when the exported policy is used directly. See [migration steps](how-to.md#migrate-from-the-previous-invocation-summary).

The same projection applies at `info`, `debug`, and `trace` logger thresholds. Standalone/entry/success record levels remain `info` or `debug`; failures retain their configured severity. Wrapper return values, thrown/rejected errors, and success/failure classification are unchanged.

**Compatibility boundary:** opt-in `includeEventShape` / `FORGE_LOG_EVENT_SHAPE` diagnostics still use the bounded, value-bearing `summarizeForLog` representation at debug/trace-enabled thresholds and can copy excluded data. They are not covered by the minimized-summary guarantee; leave them disabled for sensitive payloads. Caller-supplied policies, result summaries, raw messages, logger bindings, and ambient context can also introduce data deliberately; they are not automatically private.

### `logForgeInvocation(logger, event, message?, options?)`

Writes one structured record for a Forge event or invocation payload.

### `withForgeInvocationLogging(logger, event, operation, options?)`

Runs an operation and records its lifecycle. The wrapper logs completion for successful results and failure metadata for thrown errors.

Use it at resolver, trigger, scheduled-function, or web-trigger boundaries.

## Result and error logging

### `logResult(logger, result, options?)`

Logs success or failure-shaped results, including domain errors that use the project's `{ code: string }` error model and Problem Details values.

Options include:

| Option | Meaning |
| --- | --- |
| `message` | Message or label for the record. |
| `summarizeErr` | Callback enrichment applied *after* automatic error metadata (additive only; cannot remove fields). |
| `errorPolicy` | Object Summary Policy that replaces automatic error projection. See [error policy](#error-policy). |

### `logError(logger, error, options?)`

Projects a thrown value into minimal failure metadata. It does not translate or mutate the original error model.

| Option | Meaning |
| --- | --- |
| `message` | Caller-supplied operational message. |
| `level` | `"warn"`, `"error"` (default), or `"fatal"`. |
| `status` | Explicit status for an exception or unknown value. No default HTTP status is synthesized; domain failures remain status-free, and existing Problem Details statuses are retained. |
| `errorPolicy` | Object Summary Policy replacing the automatic error projection, including `status` inclusion. |

### Automatic failure projection

The same rules apply to `logResult` / `logger.result`, `logError` / `logger.errorResult`, invocation failures (returned `Err`, throws, rejections), and probe failures. Problem Details recognition uses `@forge-ahead/errors`' existing `isProblemDetails` predicate and takes precedence over domain-code recognition.

| Input | Automatic error fields |
| --- | --- |
| Problem Details | Present `type` and `status`. |
| Domain error (`{ code: string }`), including coded Error instances | `errorCode` from `code`; no synthesized HTTP status. |
| Other Error instance | `errorName` from `name`; no synthesized HTTP status or Problem Details type. |
| Other value | No value-derived fields; no fallback stringification. |

All failure projections include `outcome: "failure"`. Success-result logging remains unchanged (`ok: true`, plus explicit `summarizeOk` enrichment).

Causes on error objects are followed for at most three links with cycle detection. Each link uses a shallow automatic projection. `AggregateError.errors` includes at most three shallow automatic member projections; member causes/aggregates are not recursively expanded.

Automatic projection omits error messages, Problem Details `title`, `detail`, `instance`, and `timestamp`, arbitrary properties, and raw stacks (including headers and custom frames). Debug/trace thresholds do not restore these fields. The record's normal logger `time` remains.

**Application contract:** codes, Problem Details types, and Error names must be controlled operational identifiers. Their field names do not establish that arbitrary strings are non-sensitive. In particular, a `type` URI can identify a customer if the application constructs it from input; it is not sanitized by this package. This change affects logging only, not the downstream errors package or original error values.

### Error policy

`errorPolicy?: LogObjectSummaryPolicy` is available on `LogResultOptions`, `LogErrorOptions`, `ForgeInvocationLoggingOptions`, and `LogProbeOptions`. It reuses `summarizeObjectForLog`, with the same default bounds, transforms, missing-field behavior, and opt-in labels. It replaces the entire automatic error projection: unselected codes, types, statuses, causes, aggregate members, and names are absent. Only policy output plus the failure outcome remains. No separate error-policy framework is used.

Result/error policies write fields at record root. Invocation records also attach their Forge event summary, duration, outcome, and operational message; lifecycle fields take precedence (including `kind: "forgeEvent"`). Probe policies appear under `debugProbe.error`, alongside the probe label and any explicit metadata. A policy is applied to the root error, not recursively to causes or aggregate members; nested paths must be selected explicitly.

Existing `summarizeErr` callbacks on result logging remain additive after the selected projection and can overwrite fields. They cannot remove unsafe fields by merely leaving them out; `errorPolicy` is the replacement mechanism. Caller messages, callbacks, policies, probe labels/metadata, logger bindings, and ambient context remain application decisions and can reintroduce excluded data.

**Output-contract change:** automatic messages/text, arbitrary properties, raw stacks, and synthetic HTTP `500`/type values are removed. See [migration steps](how-to.md#migrate-from-previous-error-logging-breaking-change).

## Debug probes

### `logProbe(logger, label, valueOrThunk, options?)`

Logs a bounded `debug` or `trace` probe while returning the original value or promise outcome. Probe-only metadata may be lazy when the selected level is disabled.

A probe must not make the application expression conditional on whether logging is enabled.

## Console capture

### `installConsoleCapture(logger)`

Installs a temporary bridge from `console.*` calls to the Forge logger and returns an uninstall function. Captured output is intended for third-party integration boundaries.

## Demo and testing APIs

### `createDemoNarrative(logger, { storyId })`

Available from `@forge-ahead/logging/demo`. Returns `step(message, metadata?)`, which emits ordered, explicitly demo-only records.

### `createCapturingLogger(options?)`

Available from `@forge-ahead/logging/testing`. Returns `{ logger, records }` for deterministic assertions over emitted JSON records.

## Forge platform boundaries

| Concern | Package behavior | Forge behavior |
| --- | --- | --- |
| Backend log collection | Emits structured records to its destination. | Collects backend function console output and exposes it through Forge logging tools. |
| Verbosity | Resolves package levels and filters records. | Enforces platform quotas and download limits. |
| Configuration | Reads `LOG_LEVEL` from the runtime environment. | Keeps variable values per environment; changes take effect after redeploy. |
| Function wiring | Provides logger code only. | Manifest links modules to function handlers and resolver keys. |

## Public constants

- `DEFAULT_REDACT_PATHS`
- `DEFAULT_REDACTION_CENSOR`
- `DEFAULT_LOG_VALUE_SUMMARY_OPTIONS`
- `FORGE_EVENT_SUMMARY_POLICY`

## Sources

- [Forge development guide](https://developer.atlassian.com/platform/forge/)
- [Forge resolver reference](https://developer.atlassian.com/platform/forge/runtime-reference/custom-ui-resolver/)
- [Forge debugging and logging](https://developer.atlassian.com/platform/forge/debugging)
- [Forge environments and versions](https://developer.atlassian.com/platform/forge/environments-and-versions)
