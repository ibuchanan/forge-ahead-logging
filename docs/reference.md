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

Produces a bounded, JSON-safe, value-bearing representation. Summary options control depth, array size, object keys, string length, and other limits. It retains ordinary leaf values and property names; bounds and common secret-shaped-key redaction are not automatic privacy. Automatic structural diagnostics use a separate internal representation, not this API.

### `withDefaultRedaction(redact?)`

Returns Pino redaction options containing the package’s default secret-shaped paths. Caller paths are additive and retain Pino's explicit-path/wildcard syntax; a path such as `custom` does not match every nested key named `custom`. `remove` and caller `censor` options do not replace the fixed `[redacted]` censor. This helper alone does not install recursive enforcement on arbitrary Pino loggers.

### Default Redaction Backstop

`ForgeLogger` recursively censors recognized secret-shaped keys (case-insensitive authorization, cookie/set-cookie, token/accessToken/refreshToken/contextToken/jwt, password, apiKey/api_key, secret/clientSecret/client_secret) before record serialization. The backstop covers ordinary/lazy structured arguments, ambient context, base/child bindings, and already-summarized record metadata. Operational siblings remain intact within the limits below. Console arguments remain structural, not value-bearing; console enrichment receives the same backstop. Base and child bindings are sanitized before Pino pre-serializes them, so inherited binding copies contain no original recognized secret values.

| Boundary | Behavior |
| --- | --- |
| Container depth | At most 32 levels, including the record root; each evaluated `toJSON` result consumes an additional level. |
| Traversal | At most 10,000 object properties plus array slots per sanitized record/snapshot; source merging separately accepts at most 10,000 own enumerable properties, including overwritten ones. |
| Structured text | At most 1,000,000 UTF-16 code units across visited property names and retained string values; not an exact encoded-byte limit. |
| Limit exceeded | Entire structured record/snapshot replaced with `{ logRecordOmitted: "redaction limit reached" }`; no unchecked subtree returned. Normal level/time and separately supplied message remain. |
| Inspection/serialization failure during redaction | Entire structured record/snapshot replaced with `{ logRecordOmitted: "redaction unavailable" }`; no exception text copied. |

Traversal creates fresh objects/arrays and does not modify caller-owned values, including frozen values and repeated aliases. Object traversal uses own enumerable string keys; arrays retain indexed values and holes serialize as `null`. Date and custom nested `toJSON(key)` results are sanitized before Pino sees them; getters for non-secret fields are evaluated, while recognized secret-field getters are not. Custom getters/`toJSON` can run application code and are not sandboxed or time-bounded. Their side effects are the application's responsibility. Boxed strings/numbers/booleans retain their JSON primitive representation. Functions/symbols/undefined retain normal JSON omission/null behavior; cycles use `[Circular]`. Raw Error objects still are not automatic error projections; use `logError` for the supported error contract. Existing summary/metadata bounds remain in place before the backstop. Disabled records skip traversal and lazy metadata; base/child snapshots are sanitized when constructed regardless of current level.

**Compatibility:** deep recognized fields now become `[redacted]`; oversized or uninspectable structured records are omitted rather than partially copied. Custom Pino paths run after recursive sanitation, including against sanitized `toJSON` results. No new option or dependency is required.

**Privacy boundary:** this is a secondary defense, not a comprehensive privacy guarantee. Free-form messages, interpolated strings, personal data under unrecognized field names, input property names themselves, and direct underlying-Pino use via `unwrapPinoLogger` are not covered. Custom Pino serializers/hooks or bindings installed through that escape hatch are outside this contract. Allow-list application projections remain the primary defense.

### `defineLogObjectSummaryPolicy(policy)`

Validates a reusable allow-list projection for a domain object at definition time and returns the same policy object. Define policies at module initialization or configuration startup, before business operations. Invalid definitions throw `TypeError` with the offending metadata property or field-map alias and a correction. No payload values are inspected during definition.

`LogObjectSummaryPolicy` contains:

| Property | Contract |
| --- | --- |
| `kind` | Nonblank string identifying the summary category. |
| `fields` | Required field map of output aliases to source paths/selections; an empty map is valid. |
| `labels` | Optional field map, validated even when labels are disabled. |
| `review` | Optional definition-only metadata; existing safe policies need not supply it. |
| `review.purpose` | Nonblank string describing the troubleshooting need. |
| `review.indirectIdentifiers` | `{ treatment: "excluded" }` or `{ treatment: "retained", justification: string }`, with a nonblank justification for retention. Required when `review` is present. |

A selection is a dot-separated string path, a nonempty array of literal string segments, or `{ path, transform? }`. Segments must be nonblank; empty paths/segments and unknown transforms are rejected. Omitted/`undefined` transforms mean `identity`. Maps and metadata must be non-null, non-array objects. Validation does not trim or rewrite definitions.

**Source-path validation:** any path segment matching the case-insensitive [recognized secret-shaped keys](#default-redaction-backstop) may use only `redact` or `omittedShape`; implicit/explicit `identity` is rejected. Both `fields` and `labels` are checked, including aliases, array paths, and paths descending through a recognized secret key. Diagnostics identify the source path, not just the output alias. A purpose or retention justification does not override this rule.

**Review boundary:** metadata documents an application decision, not automatic classification. Validation checks shape, nonblank explanations, supported transforms, and recognized source names only. It cannot determine whether arbitrary strings/custom domain fields contain personal data or credentials, whether `excluded` is truthful, or whether a justification is sufficient. Generic `id`/`name` fields are neither automatically forbidden nor declared safe. Selecting a parent object with `identity` still permits its ordinary nested values within the existing bounds and key-based redaction.

`review` is never automatically included in summary output or log records, never selects additional fields, and never enables labels. Purpose annotations are not legal approval, user consent, anonymization, or enforcement of downstream retention. Access, necessity, and retention remain application responsibilities.

**Compatibility:** `review` is optional, safe existing policies and built-in defaults retain their output, and the helper still returns the original object. Previously accepted unsafe or malformed definitions now fail at definition time; see [migration](how-to.md#migrate-and-review-object-summary-policies-breaking-change). `summarizeObjectForLog` and its consumers do not revalidate policies during business operations. Direct object literals bypass definition-time validation, and later mutation invalidates its assurance; validate through this helper at startup and treat definitions as immutable application configuration.

### `summarizeObjectForLog(value, policy, options?)`

Projects and summarizes an object according to a `LogObjectSummaryPolicy`. `fields` are explicit application selections; `labels` are selected only with `includeLabels: true` at the call site. `FORGE_LOG_LABELS` no longer enables labels. Both maps require application review; generic names such as `name` or `id` do not establish sensitivity or safety. Selecting an object with `identity` can retain its nested keys and values within the normal bounds.

### Built-in transforms

`LogFieldTransform` supports these named, package-controlled transformations. Policies do not accept arbitrary callback functions.

| Transform | Output |
| --- | --- |
| `identity` (default) | The selected value passed through the bounded value summarizer. |
| `redact` | `[redacted]` for a present field. |
| `omittedShape` | `{ omitted: true }`, plus `length` for strings, `items` for arrays, or `keys` for objects; no field names or values are copied. |

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

### Structural diagnostics

`eventShape`, unprojected probe values/metadata, and captured console arguments share a structural representation. It never copies leaf values or input property names, including unknown/customer-controlled keys. The built-in invocation and automatic error projections remain unchanged when verbosity increases.

| Input | Structural output |
| --- | --- |
| `null` | `{ type: "null" }` |
| String | `{ type: "string", length: number }`; no prefix or suffix. |
| Other primitive or function | `{ type: "number" }`, `"boolean"`, `"undefined"`, `"bigint"`, `"symbol"`, or `"function"`; no value, description, or function name. |
| Object | `{ type: "object", keys: number, values: [...] }`; unnamed child shapes in own enumerable string-key order. |
| Array | `{ type: "array", items: number, values: [...] }`; unnamed enumerable entry shapes. |
| Accessor property | `{ type: "accessor" }`; getters/setters are not invoked. |
| Depth/cycle boundary | `{ type: "object" \| "array", omitted: "max depth" \| "circular" }`. |
| Inspection failure | `{ type: "unknown", omitted: "unavailable" }` for the whole structural summary; no exception text. |

Defaults retain at most 5 array entries, 12 object entries, and 3 container levels. `omitted: number` counts unvisited enumerable entries when capped. Strings contribute only length, so no string-truncation marker is needed. Structural traversal does not call `toJSON` or stringify objects. Standalone event-shape options reuse `maxDepth`, `maxArrayItems`, and `maxObjectKeys`; lifecycle entries, probes, and console capture use the defaults. Size/count metadata is still collected data, not a guarantee against all inference.

`includeEventShape` overrides `FORGE_LOG_EVENT_SHAPE === "true"`. Structural event shapes require a debug/trace-enabled logger, even when the record is written at info. At info-only thresholds, explicit `true` yields `eventShapeOmitted: "requires debug or trace"`; the environment toggle alone yields no shape or marker. Explicit `false` disables the shape. Lifecycle shapes appear on optional entry records, not completion/failure records.

**Output-contract change:** shapes no longer use value-bearing `summarizeForLog` output. See [diagnostic migration](how-to.md#migrate-from-value-bearing-diagnostics-breaking-change). Caller-supplied policies, result summaries, raw messages, logger bindings, and ambient context can still introduce values deliberately; they are not automatically private.

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

Logs a bounded `debug` (default) or `trace` probe while returning the original value or promise outcome. The expression/thunk always runs, even when the requested probe level is disabled. Disabled probes do not compute summaries, policy projections, or lazy metadata. Enabled promise probes log only after settlement.

| Option | Meaning |
| --- | --- |
| `level` | `"debug"` (default) or `"trace"`; the logger threshold must enable the selected level. |
| `metadata` | Value or lazy callback; structural by default. |
| `valuePolicy` | Explicit Object Summary Policy replacing the structural successful-value summary under `debugProbe.value`. |
| `metadataPolicy` | Explicit Object Summary Policy replacing structural metadata under `debugProbe.metadata`. |
| `errorPolicy` | Explicit replacement for the minimal failure projection under `debugProbe.error`. |

Policies reuse the existing bounds and transforms. Policy labels remain absent; review necessary fields into the policy's `fields` map rather than relying on an environment toggle. If probe-only metadata, projection, or record emission throws, that probe record is dropped, not retried or stringified; the original sync value, throw, fulfillment, or rejection is preserved.

**Raw-text escape hatch:** the `label` parameter is caller-supplied text and remains verbatim. Use fixed app-controlled labels, not names, identifiers, tokens, or customer content. There is no arbitrary-text privacy detector.

## Console capture

### `installConsoleCapture(logger)`

Installs a temporary bridge from `console.*` calls to the Forge logger and returns an uninstall function. `log`/`info` write at info, `warn` at warn, `error` at error, and `debug` at debug. Remaining arguments are structural under `consoleArgs`; a non-string first argument is included there and uses a fixed `console.<method>` message. No argument values or property names are copied, and captured Error objects do not receive a raw message/stack projection.

**Raw-message escape hatch:** a leading string is retained verbatim as the record message, including formatting placeholders; subsequent arguments are not interpolated. Capture does not sanitize that string. Do not capture third-party output containing sensitive message text merely because structured arguments are minimized. For reviewed value-bearing evidence, use an explicit Object Summary Policy with the logger directly instead of console capture. Uninstall restores the previous console methods.

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
