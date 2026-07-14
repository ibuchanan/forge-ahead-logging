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
import { createForgeLogger } from "@forge-ahead/logging";

const logger = createForgeLogger({ name: "my-forge-app" });

logger.info({ userId: "abc-123" }, "handled request");
logger.debug({}, "verbose diagnostic detail");
```

Level methods (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) are
object-first: pass a metadata object as the first argument, using `{}` when
there is no metadata to attach. This package's `ForgeLogger` does not expose
pino's string-only call shape.

## `LOG_LEVEL`

`createForgeLogger()` resolves its effective level in this order:

1. A valid `LOG_LEVEL` value (`fatal`, `error`, `warn`, `info`, `debug`,
   `trace`, or `silent`).
2. `debug`, when `NODE_ENV` is `development` and `LOG_LEVEL` is unset.
3. `info` otherwise — the safe default for both local runs and production.

An invalid `LOG_LEVEL` value falls back to `info` rather than throwing.
`resolveLogLevel()` and `getLogLevel()` expose this same resolution for
callers that need it directly, and `options.env` lets tests and scripts
inject an environment object instead of mutating `process.env`:

```ts
import { getLogLevel, resolveLogLevel } from "@forge-ahead/logging";

resolveLogLevel({ LOG_LEVEL: "debug" });
// { level: "debug", source: "LOG_LEVEL" }

getLogLevel({ LOG_LEVEL: "not-a-level" });
// "info" (falls back; resolveLogLevel() also reports invalidValue)
```

In a deployed Forge app, `LOG_LEVEL` is a non-secret Forge runtime variable.
`debug` and `trace` are meant for short-lived diagnostics, set explicitly —
not left on by default.

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
`includeLabels: true`. Fields missing from the source value are omitted
rather than emitted as `undefined`.

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
`trace`. `logger.result(result, options)` and
`logger.errorResult(error, options)` are the equivalent logger methods.

## API Surface

- `createForgeLogger(options?)` returns a `ForgeLogger`; `unwrapPinoLogger(logger)`
  exposes the underlying pino instance for interop.
- `resolveLogLevel(env?)` and `getLogLevel(env?)` resolve `LOG_LEVEL`/`NODE_ENV`
  without logging as a side effect.
- `withDefaultRedaction(redact?)`, `DEFAULT_REDACT_PATHS`, and
  `DEFAULT_REDACTION_CENSOR` back the default redaction backstop.
- `summarizeForLog(value, options?)` produces JSON-safe, bounded,
  depth/size-limited summaries of arbitrary values.
- `defineLogObjectSummaryPolicy(policy)` and
  `summarizeObjectForLog(value, policy, options?)` implement Object Summary
  Policies and the `identity`/`redact`/`tokenPreview`/`omittedShape` Field
  Transforms.
- `FORGE_EVENT_SUMMARY_POLICY`, `summarizeForgeInvocation(event, options?)`,
  `logForgeInvocation(logger, event, message?, options?)`, and
  `logger.forgeInvocation(...)` cover Forge invocation logging.
- `logResult(logger, result, options?)`, `logError(logger, error, options?)`,
  `logger.result(...)`, and `logger.errorResult(...)` cover Result/Error logging,
  integrated with `@forge-ahead/errors`.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup, package scripts, and
project layout. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for repository contribution guidance.

## License

Apache-2.0. See [LICENSE](LICENSE).
