# @forge-ahead/logging

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)

A small, opinionated, Forge-oriented wrapper around [`pino`](https://getpino.io/).
It keeps structured logging as the primary interface and adds Forge-specific
helpers that reduce log bloat, avoid customer-data leaks, and make production
debug logging opt-in through a declared Forge variable.

This package is currently private (`"private": true` in `package.json`), so use
it from this repository or a configured private workspace rather than
installing it from the public npm registry.

In a consuming Forge app with access to the package registry:

```sh
npm install @forge-ahead/logging
```

## Why this exists

Forge apps run in a cost-metered, multi-tenant runtime handling real customer
data. Logging in that environment has different defaults than a typical
Node service:

- Verbose success-path logging is a cost problem, not just noise.
- Logging raw event payloads, headers, or tokens is a customer-data leak, not
  a convenience.
- Debug logging should be an explicit, short-lived opt-in — not a code
  default that gets left on in production.

This package assumes a Forge runtime variable named `LOG_LEVEL` and resolves
it the same way in every app, so debug logging is disabled in production
unless that variable explicitly enables it. It wraps `pino` rather than
replacing it: normal app code never needs to import `pino` directly, but
[`unwrapPinoLogger()`](#api-surface) remains available as an escape hatch for
code that does.

This package does not replace Forge invocation metrics, does not invent a
general observability framework, and does not attempt to model every possible
Atlassian payload shape — its redaction and summary tools are a backstop and
an allow-list, not a guarantee.

## Usage

The package is published as ESM and targets Node 22 or newer, matching
Atlassian's recommended Forge runtime floor for new deployments.

```ts
import { log } from "@forge-ahead/logging";

log.info({ userId: "abc-123" }, "handled request");
log.debug({}, "verbose diagnostic detail");
```

`log` is a ready-to-use default logger. It is created on first use, not at
import time, so `LOG_LEVEL` resolution is not frozen before the consuming
environment can read Forge variables.

Use `createForgeLogger()` when you need a named logger, custom redaction, or
an injected `env` for tests and scripts:

```ts
import { createForgeLogger } from "@forge-ahead/logging";

const logger = createForgeLogger({ name: "my-forge-app" });

logger.info({ userId: "abc-123" }, "handled request");
```

### Pretty mode for local development

By default the logger emits NDJSON so `forge logs` and other structured
consumers can parse each record. For local runs, pass `pretty: true` or set
`FORGE_LOG_PRETTY=true` to emit monochrome, human-readable lines instead:

```ts
const logger = createForgeLogger({ pretty: true });

logger.info({ userId: "abc-123" }, "handled request");
// 2026-08-01T12:34:56.789Z INFO handled request userId=abc-123
```

Pretty mode is opt-in and never enabled by default. `FORGE_LOG_PRETTY` is
intended for local development and test runs; do not set it in production or
in the Forge runtime.

### Timestamp format

By default emitted records carry pino's `time` field as epoch milliseconds,
so downstream parsers are unaffected. Pass `timestamp: "iso"` to emit ISO-8601
strings instead:

```ts
const logger = createForgeLogger({ timestamp: "iso" });

logger.info({ userId: "abc-123" }, "handled request");
// { ..., "time": "2026-08-01T12:34:56.789Z", ... }
```

`configureForgeLogger({ timestamp: "iso" })` applies the same format to the
default `log` logger. Only enable this when every downstream consumer can
parse string timestamps.

Level methods (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) are
object-first: pass a metadata object as the first argument, using `{}` when
there is no metadata to attach. A message-only call is also supported when
there is no metadata:

```ts
log.info("handled request");
// equivalent to: log.info({}, "handled request")
```

Object-first remains the recommended shape for production code; the
message-only form is a convenience for simple cases. This package's
`ForgeLogger` does not expose pino's string-interpolation call shape.

### Lazy metadata

The first argument may also be a zero-argument function that returns the
metadata object. The function is only called when the requested level is
enabled, so expensive diagnostics are skipped in production:

```ts
log.debug(
  () => ({ queryPlan: expensiveExplain(), snapshot: buildSnapshot() }),
  "computed diagnostic",
);
```

If the level is disabled, the thunk never runs. If the level is enabled, the
thunk result is logged the same way as a normal metadata object. A thunk that
throws is propagated to the caller; no record is emitted.

Use `logger.isLevelEnabled(level)` to branch explicitly when a thunk is not the
right fit.

### Dynamic-level logging

`logger.log(level, metadata, message?)` routes a computed level to the matching
level method. It only accepts the existing seven levels and silently ignores
invalid levels:

```ts
const severity = computeSeverity();
logger.log(severity, { userId: "abc-123" }, "handled request");
```

### Ambient log context

`withLogContext(bindings, operation)` attaches bindings to every log record
emitted inside the operation without passing a child logger through every
function signature:

```ts
import { withLogContext } from "@forge-ahead/logging";

await withLogContext({ requestId: "req-123", cloudId: "cloud-1" }, async () => {
  await doWork();
  log.info({ step: "done" }, "finished work");
  // record contains { requestId, cloudId, step, msg }
});
```

Explicit per-call metadata wins over ambient context, `recordMetadata`, and
base/`child()` bindings on the same key. Precedence, from lowest to highest, is:
base/`child()` bindings, `recordMetadata`, ambient context, then explicit
per-call metadata. Ambient values are summarized and redacted the same way as
normal metadata. Context is empty outside any `withLogContext` scope and does
not leak after the scope ends. Concurrent invocations are isolated.

### Invocation wrapper

`logger.invocation(event, handler, options?)` wraps a Forge resolver or handler
and emits a single completion record with `durationMs` and `outcome`. Thrown
and rejected values are logged through the safe Problem Details path and then
rethrown with the same identity. Return values from `@forge-ahead/errors`
`Result` are classified correctly:

```ts
export const handler = async (event: WebTriggerEvent) =>
  log.invocation(event, async () => {
    const result = await doWork(event);
    return result;
  });
```

Entry logging is opt-in via `logEntry: true`. Set `successLevel`, `errorLevel`,
`successMessage`, `errorMessage`, and `summarizeResult` to control the completion
record. The handler body inherits any ambient log context from the caller.

## `LOG_LEVEL`

`createForgeLogger()` resolves its effective level in this order:

1. A valid `LOG_LEVEL` value (`fatal`, `error`, `warn`, `info`, `debug`,
   `trace`, or `silent`).
2. A per-name override, such as `LOG_LEVEL="info,my-lib=debug"`, for a named
   logger and its children.
3. `debug`, when `NODE_ENV` is `development` and `LOG_LEVEL` is unset.
4. `info` otherwise — the safe default for both local runs and production.

An invalid `LOG_LEVEL` segment falls back to the next applicable rule rather
than throwing. `resolveLogLevel()` and `getLogLevel()` expose this same
resolution for callers that need it directly, and `options.env` lets tests
and scripts inject an environment object instead of mutating `process.env`:

```ts
import { getLogLevel, resolveLogLevel } from "@forge-ahead/logging";

resolveLogLevel({ LOG_LEVEL: "debug" });
// { level: "debug", source: "LOG_LEVEL" }

resolveLogLevel("my-lib", { LOG_LEVEL: "info,my-lib=debug" });
// { level: "debug", source: "LOG_LEVEL" }

getLogLevel({ LOG_LEVEL: "not-a-level" });
// "info" (falls back; resolveLogLevel() also reports invalidValue)
```

In a deployed Forge app, `LOG_LEVEL` is a non-secret Forge runtime variable.
`debug` and `trace` are meant for short-lived diagnostics, set explicitly —
not left on by default.

## Configuring the default logger and per-record enrichment

Use `configureForgeLogger(options)` to reconfigure the ready-to-use default
`log` logger. It only affects the default singleton; `createForgeLogger()`
instances are unaffected:

```ts
import { configureForgeLogger } from "@forge-ahead/logging";

configureForgeLogger({ name: "my-forge-app" });
```

Use `recordMetadata` on any logger to add stable per-record fields (such as a
trace ID) from a callback. The callback is only invoked when the record's level
is enabled, and its output is summarized and redacted before it reaches the
record. If the callback throws, the record is still emitted with a
`recordMetadataError: true` marker instead of crashing the application call:

```ts
const logger = createForgeLogger({
  recordMetadata: () => ({ traceId: getTraceId() }),
});

logger.info({ userId: "abc-123" }, "handled request");
// record includes { traceId, userId, ... }
```

Precedence, from lowest to highest, is:

1. `base`/`child()` bindings
2. `recordMetadata`
3. Ambient context from `withLogContext`
4. Explicit per-call metadata

## Default redaction is a backstop

`createForgeLogger()` configures pino with a conservative default `redact`
list covering representative secret-shaped fields (`authorization`, `cookie`,
`token`, `password`, `secret`, and similar). Redacted fields keep their key
with the value replaced by `[redacted]`, rather than being removed.

This list is **not** a complete model of every Forge or Atlassian payload.
The primary leak-prevention mechanism is allow-list logging through Object
Summary Policies and Forge invocation summaries (below) — default redaction
is a secondary safety net for whatever those allow-lists miss.

Custom redaction paths merge with the defaults rather than replacing them:

```ts
import { createForgeLogger, withDefaultRedaction } from "@forge-ahead/logging";

createForgeLogger({ redact: ["myApp.internalToken"] });

withDefaultRedaction(["myApp.internalToken"]);
// { paths: [...defaults, "myApp.internalToken"],
//   censor: "[redacted]", remove: false }
```

## Object Summary Policies

Rich domain objects (deployments, issues, users, and so on) can be logged
through a data-only allow-list policy instead of their raw shape:

```ts
import { defineLogObjectSummaryPolicy, summarizeObjectForLog } from "@forge-ahead/logging";

const deploymentPolicy = defineLogObjectSummaryPolicy({
  kind: "deployment",
  fields: {
    deploymentSequenceNumber: "deploymentSequenceNumber",
    updateSequenceNumber: "updateSequenceNumber",
  },
  labels: {
    displayName: "displayName", // human-readable; excluded by default
  },
});

summarizeObjectForLog(deployment, deploymentPolicy);
// { kind: "deployment", deploymentSequenceNumber: 42, updateSequenceNumber: 7 }

summarizeObjectForLog(deployment, deploymentPolicy, { includeLabels: true });
// adds { displayName: "..." }
```

Fields are included by default; `labels` (human-readable, possibly
customer-identifying text) are excluded unless a caller opts in with
`includeLabels: true` or sets `FORGE_LOG_LABELS=true`. Fields missing from the
source value are omitted rather than emitted as `undefined`.

Each field selection can apply a built-in Field Transform instead of the
default `identity` summary:

| Transform | Behavior |
| --- | --- |
| `identity` | Summarize the value with `summarizeForLog()` (the default). |
| `redact` | Emit `[redacted]` when the value is present. |
| `tokenPreview` | String → `"123...890"`; other values → `[redacted]`. |
| `omittedShape` | Shape only: `{ omitted: true, length: N }`. |

Custom extractor callbacks are intentionally not supported — a selection is
always a field path plus, optionally, one of these four transforms.

## Diagnostic env-var toggles

A small set of env-var toggles widens diagnostic metadata only when the
effective log level already allows the record. They are default-off and are
intended for short-lived debugging, not for leaving on in production:

- `FORGE_LOG_LABELS=true` includes `labels` in Object Summary Policy output when
  calling `summarizeObjectForLog()` (or `summarizeForgeInvocation()`).
- `FORGE_LOG_EVENT_SHAPE=true` includes the full bounded event shape in
  `logForgeInvocation()` output when the logger's effective level is `debug` or
  `trace`.

Set these alongside `LOG_LEVEL=debug` for a focused debugging session, then
unset them:

```sh
LOG_LEVEL=debug FORGE_LOG_EVENT_SHAPE=1 node script.js
```

These toggles never change the resolved level; they only add metadata when the
level already emits the record.

## Forge invocation logging

`FORGE_EVENT_SUMMARY_POLICY` is a ready-made policy for Forge invocation-like
objects (resolver/web-trigger events, and similar). It works on `unknown`
input without importing a Forge TypeScript interface, and never logs `body`,
`headers`, or `contextToken` raw:

```ts
import { logForgeInvocation } from "@forge-ahead/logging";

logForgeInvocation(logger, event, "handling request");
// { kind: "forgeEvent", eventType, method, path, cloudId, ..., contextToken: "123...890",
//   headers: { omitted: true, keys: 2 }, body: { omitted: true, length: 20 } }
```

The same helper is available as `logger.forgeInvocation(event, message, options)`.
Passing `includeEventShape: true` adds the full bounded event shape — but only
when the logger's effective level is `debug` or `trace`. At `info` or higher
it instead adds `eventShapeOmitted: "requires debug or trace"`, so opting in
never silently leaks a payload in production:

```ts
logForgeInvocation(logger, event, "handling request", {
  includeEventShape: true,
});
// at info:  { ..., eventShapeOmitted: "requires debug or trace" }
// at debug: { ..., eventShape: { /* bounded, summarized event */ } }
```

`FORGE_LOG_EVENT_SHAPE=true` enables the same bounded event shape at `debug` or
`trace` without changing application code; it does not add the omitted marker
or bypass the level gate.

## Result and Error logging

`logResult()` and `logError()` integrate directly with
[`@forge-ahead/errors`](https://github.com/ibuchanan/forge-ahead-errors),
rather than only accepting structural error payloads:

```ts
import { ok, StandardError } from "@forge-ahead/errors";
import { logResult } from "@forge-ahead/logging";

const notFound = StandardError.getOrDefault(404).error("not found");

logResult(logger, notFound);
// Err: logs at "error" by default — only approved ProblemDetails fields
//   (type, title, status, detail, timestamp, instance)

logResult(logger, ok({ deploymentSequenceNumber: 42 }));
// Ok: logs at "debug" by default — a generic { ok: true } marker,
//   never the raw value
```

Both directions never log the raw value by default. `summarizeOk`/`summarizeErr`
options add caller-provided metadata on top, after that normal handling:

```ts
logResult(logger, result, {
  summarizeOk: (deployment) => ({
    deploymentSequenceNumber: deployment.deploymentSequenceNumber,
  }),
  summarizeErr: (problem) => ({ retryable: problem.status >= 500 }),
});
```

`logError()` is the equivalent helper for `catch` blocks, normalizing any
thrown value through `@forge-ahead/errors`' `toProblemDetails()`:

```ts
import { logError } from "@forge-ahead/logging";

try {
  await risky();
} catch (thrown) {
  logError(logger, thrown);
}
```

Non-`ProblemDetails` `Error` instances also get an `errorName` field. Stack
traces are included only when the logger's effective level is `debug` or
`trace`, and they are truncated to a bounded frame count with a visible
`[N frames omitted]` marker.

`error.cause` chains are logged as a bounded `causes` array of normalized error
records, and `AggregateError.errors` is summarized as a bounded `errors`
array. Cycles are detected and terminate the chain. `logger.result(result,
options)` and `logger.errorResult(error, options)` are the equivalent logger
methods.

## Debug Probe

A Debug Probe is a pass-through logging convenience for wrapping a value or
an application expression: it returns the original value (or preserves the
original async fulfillment/rejection), while emitting a bounded, namespaced
log record as a side effect. It only ever logs at `debug` or `trace`, never
at the package's default `info` level, so it is safe to leave in code without
a separate cleanup pass:

```ts
import { logProbe } from "@forge-ahead/logging";

const total = logProbe(logger, "cartTotal", computeTotal(cart));
// pass-through: `total` is exactly computeTotal(cart)'s return value

const user = await logProbe(logger, "fetchUser", () => fetchUser(id));
// pass-through: fulfills with the resolved user, or rethrows the same
// rejection — either way, one debugProbe record is logged after settling
```

Successful probes log `{ debugProbe: { label, value } }`, where `value` is
produced with `summarizeForLog()`. Rejected async work or a probe thunk that
throws synchronously logs `{ debugProbe: { label, error } }` instead, using
the same approved Problem Details-style error fields as `logResult()`/
`logError()`, and still rethrows or rejects for the caller — a probe never
swallows an error, it only adds a log record alongside it.

A caller-supplied label is required, and probes accept one value at a time —
pass an object when inspecting several values together. Pass a thunk
(`() => expression`) rather than a bare value when the expression might throw
synchronously, so the probe can log the failure before rethrowing it:

```ts
logProbe(logger, "cartTotal", computeTotal(cart), { level: "trace" });

logProbe(logger, "cartTotal", computeTotal(cart), {
  metadata: { cartId: cart.id },
});

logProbe(logger, "cartTotal", computeTotal(cart), {
  metadata: () => ({ cartId: cart.id }), // computed only if the level is enabled
});
```

`metadata` may be a plain value or a zero-argument function; when it's a
function it is only called if the requested probe level is enabled, so
expensive probe-only diagnostics don't run in production. The probed value or
thunk itself always runs regardless of level — a probe never makes
application behavior conditional on logging.

`logger.probe(label, valueOrThunk, options?)` is the equivalent logger
method, including on `child()` loggers, where emitted records carry the
child's bindings.

Debug Probe is a development-time convenience, distinct from [Demo Narrative
Logging](#demo-narrative-logging): a probe wraps real application code and
preserves its behavior, while Demo Narrative Logging is example-only
storytelling with no pass-through value.

## Demo Narrative Logging

Demo Narrative Logging is for **example code**, not production apps: it lets
a static repo "tell its story" through ordinary structured `ForgeLogger`
records, so a demo reads clearly even without live narration. It is kept
behind an explicit `@forge-ahead/logging/demo` subpath rather than the root
package, so demo-only imports are easy to spot in review and never end up in
production code:

```ts
import { createForgeLogger } from "@forge-ahead/logging";
import { createDemoNarrative } from "@forge-ahead/logging/demo";

const logger = createForgeLogger({ name: "onboarding-demo" });
const demo = createDemoNarrative(logger, { storyId: "onboarding" });

demo.step("user signs up");
demo.step("welcome email queued", { templateId: "welcome-v2" });
```

Every step logs at `info` through the supplied logger, with `kind:
"demoNarrativeStep"`, `demoOnly: true`, the narrative's `storyId`, and an
automatically incrementing `stepNumber`:

```json
{ "level": 30, "kind": "demoNarrativeStep", "demoOnly": true, "storyId": "onboarding", "stepNumber": 1, "msg": "user signs up" }
```

Step metadata is optional — message-only steps are valid — and, when
supplied, is summarized and redacted the same way as everywhere else in this
package, via `summarizeForLog()`. Use a distinct `storyId` per narrative
thread; nested or child narratives are not supported in this version.

## Console capture for third-party dependencies

Third-party libraries that write directly to `console.log`/`console.error`
can be routed through the Forge logger so their output is summarized and
redacted instead of bypassing the package's controls. Capture is opt-in and
off by default:

```ts
import { installConsoleCapture } from "@forge-ahead/logging";

const uninstall = installConsoleCapture(logger);

someLibrary.doWork(); // console.log output now appears as logger records

uninstall(); // restore original console.* methods
```

`console.log`/`console.info` are captured at `logger.info`, `console.warn` at
`logger.warn`, and `console.error`/`console.debug` at `logger.error`/`logger.debug`.
The logger's own output is detected and routed to the original `console.*`
methods, so it does not loop back through the capture.

## Testing helpers

A public testing subpath lets tests assert against real log records without
mocking global `console.*` or re-implementing log capture. The captured records
flow through the same redaction, summary, and level-gating logic as the
production logger, so tests can verify that sensitive fields are redacted:

```ts
import { createCapturingLogger } from "@forge-ahead/logging/testing";

const { logger, records } = createCapturingLogger({ env: { LOG_LEVEL: "debug" } });

logger.info({ userId: "abc-123", token: "shh" }, "handled request");

const [record] = records;
expect(record.userId).toBe("abc-123");
expect(record.token).toBe("[redacted]");
```

`createCapturingLogger(options?)` accepts the same `ForgeLoggerOptions` as
`createForgeLogger()`. The returned `records` array contains the parsed JSON
records emitted by that logger. The helper is only exported from the
`@forge-ahead/logging/testing` subpath; it is not available from the root
package.

## API Surface

- `log` is the ready-to-use default `ForgeLogger`; use `createForgeLogger(options?)`
  for named loggers, custom redaction, injected `env`, `pretty: true` for
  local human-readable output (also enabled via `FORGE_LOG_PRETTY=true`),
  `recordMetadata` for stable per-record fields, or `timestamp: "iso"` for
  ISO-8601 timestamps.
- Level methods accept object-first metadata, a message-only string, or a lazy
  metadata thunk. `logger.isLevelEnabled(level)` checks whether a level is active.
- `withLogContext(bindings, operation)` and `getLogContext()` manage ambient
  bindings that merge into every record emitted inside the scope.
- `logger.invocation(event, handler, options?)` and `withForgeInvocationLogging(...)`
  wrap a handler, log a completion record with `durationMs` and `outcome`, and
  rethrow any error. `Result` return values are classified as success/failure.
- `unwrapPinoLogger(logger)` exposes the underlying pino instance for interop.
- `configureForgeLogger(options?)` reconfigures the default singleton logger
  (`log`); `createForgeLogger()` instances are unaffected.
- `resolveLogLevel(name?, env?)` and `getLogLevel(env?)` resolve
  `LOG_LEVEL`/`NODE_ENV`, including per-name overrides, without logging as a
  side effect.
- `withDefaultRedaction(redact?)`, `DEFAULT_REDACT_PATHS`, and
  `DEFAULT_REDACTION_CENSOR` back the default redaction backstop.
- `summarizeForLog(value, options?)` produces JSON-safe, bounded,
  depth/size-limited summaries of arbitrary values.
- `defineLogObjectSummaryPolicy(policy)` and
  `summarizeObjectForLog(value, policy, options?, env?)` implement Object Summary
  Policies and the `identity`/`redact`/`tokenPreview`/`omittedShape` Field
  Transforms. `FORGE_LOG_LABELS=true` defaults `includeLabels` to true.
- `FORGE_EVENT_SUMMARY_POLICY`, `summarizeForgeInvocation(event, options?, env?)`,
  `logForgeInvocation(logger, event, message?, options?, env?)`, and
  `logger.forgeInvocation(...)` cover Forge invocation logging.
  `FORGE_LOG_EVENT_SHAPE=true` includes the event shape at `debug`/`trace`.
- `logResult(logger, result, options?)`, `logError(logger, error, options?)`,
  `logger.result(...)`, and `logger.errorResult(...)` cover Result/Error logging,
  integrated with `@forge-ahead/errors`.
- `logProbe(logger, label, valueOrThunk, options?)` and `logger.probe(...)`
  implement Debug Probe.
- `installConsoleCapture(logger)` redirects `console.log`/`console.error` from
  third-party dependencies through the Forge logger; it returns an `uninstall`
  function that restores the original `console.*` methods.
- `createDemoNarrative(logger, { storyId })` from the `@forge-ahead/logging/demo`
  subpath implements Demo Narrative Logging; it is not exported from the root
  package.
- `createCapturingLogger(options?)` from the `@forge-ahead/logging/testing`
  subpath returns a `{ logger, records }` test helper; it is not exported from the
  root package.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup, package scripts, and
project layout. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for repository contribution guidance.

## License

Apache-2.0. See [LICENSE](LICENSE).
