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

`LogFieldTransform` represents named, package-controlled transformations such as token previews, redaction, and omitted-shape summaries. Policies do not accept arbitrary callback functions.

## Forge event logging

### `summarizeForgeInvocation(event, options?)`

Returns the bounded event summary used by invocation logging.

### `logForgeInvocation(logger, event, message?, options?)`

Writes one structured record for a Forge event or invocation payload.

### `withForgeInvocationLogging(logger, event, operation, options?)`

Runs an operation and records its lifecycle. The wrapper logs completion for successful results and failure metadata for thrown errors.

Use it at resolver, trigger, scheduled-function, or web-trigger boundaries.

## Result and error logging

### `logResult(logger, result, options?)`

Logs success or failure-shaped results, including domain errors that use the project’s `{ code: string }` error model and Problem Details values.

### `logError(logger, error, options?)`

Normalizes an unknown thrown value into bounded error metadata. Error causes and stack frames are bounded.

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
