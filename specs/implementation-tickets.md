# Implementation Tickets for `@forge-ahead/logging`

## Status

Draft handoff plan.

## Context

These tickets implement the standalone `@forge-ahead/logging` package described
in `specs/forge-ahead-logging.md`. The work is scoped to this repository only.
Downstream integration work for other packages is tracked separately in
`specs/downstream-integration-work.md`.

Work the frontier: start with tickets that have no blockers, then proceed only
when each ticket's blockers are complete.

## Tickets

### 01 — Replace copied errors package with logging skeleton

**What to build:** The package stops exporting the copied
`@forge-ahead/errors` implementation and becomes a clean `@forge-ahead/logging`
package skeleton with the right dependency on `@forge-ahead/errors`, build
entrypoint, and no compatibility exports.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Package source no longer exposes copied error-helper APIs as this
      package's public implementation.
- [ ] Package metadata, build entrypoint, and tests target the logging package.
- [ ] `@forge-ahead/errors` is treated as a direct runtime dependency.
- [ ] Old console-oriented compatibility helpers are not exported by this
      package.

### 02 — Build log level resolution and core pino logger

**What to build:** Consumers can create a pino-backed `ForgeLogger` with
object-first level methods, `LOG_LEVEL`/`NODE_ENV` resolution, `options.env`
test injection, child loggers, pino unwrap, name support, and suppressed default
base fields.

**Blocked by:** 01 — Replace copied errors package with logging skeleton.

**Status:** ready-for-agent

- [ ] `resolveLogLevel()` returns effective level, source, and invalid-value
      metadata without logging as a side effect.
- [ ] `getLogLevel()` returns only the resolved level.
- [ ] `createForgeLogger()` uses `options.env` or `process.env` and has no
      direct level override option.
- [ ] `ForgeLogger` level methods require object-first calls, using `{}` for
      empty metadata.
- [ ] `child(bindings)` passes stable bindings through to pino.
- [ ] `unwrapPinoLogger()` exposes the underlying pino logger.
- [ ] Default pino base fields are suppressed unless the caller supplies
      `base`.
- [ ] Logger `name` is included when supplied.

### 03 — Add the default redaction backstop

**What to build:** The core logger applies representative secret-shaped pino
redaction paths, custom redaction merges with defaults, and tests show the
backstop works without claiming complete platform payload safety.

**Blocked by:** 02 — Build log level resolution and core pino logger.

**Status:** ready-for-agent

- [ ] Default pino redaction censors representative secret-shaped fields.
- [ ] Redaction keeps field shape instead of removing fields.
- [ ] `withDefaultRedaction()` merges caller additions with defaults.
- [ ] `createForgeLogger({ redact })` also merges caller redaction with
      defaults.
- [ ] Tests and docs describe default redaction as a secondary backstop, not a
      complete payload safety model.

### 04 — Build bounded summaries and Object Summary Policies

**What to build:** Consumers can safely summarize arbitrary values and rich
domain objects using data-only Object Summary Policies, labels, and built-in
Field Transforms: `identity`, `redact`, `tokenPreview`, and `omittedShape`.

**Blocked by:** 01 — Replace copied errors package with logging skeleton.

**Status:** ready-for-agent

- [ ] `summarizeForLog()` produces JSON-safe bounded summaries for primitives,
      arrays, objects, circular references, non-JSON values, long strings, and
      secret-shaped keys.
- [ ] Object Summary Policies are data-only alias-to-selection maps.
- [ ] Labels are omitted by default and included only with explicit opt-in.
- [ ] Missing policy fields are omitted rather than emitted as `undefined`.
- [ ] Field Transforms implement identity summary, redaction, token preview, and
      omitted shape summary.
- [ ] No arbitrary custom extractor callbacks are supported in version 1.

### 05 — Implement Forge invocation summaries on the policy system

**What to build:** `FORGE_EVENT_SUMMARY_POLICY`,
`summarizeForgeInvocation()`, `logForgeInvocation()`, and
`logger.forgeInvocation()` work without importing a Forge interface, omit raw
payload fields, and gate full event shape behind effective `debug`/`trace`.

**Blocked by:** 02 — Build log level resolution and core pino logger; 04 —
Build bounded summaries and Object Summary Policies.

**Status:** ready-for-agent

- [ ] `FORGE_EVENT_SUMMARY_POLICY` captures common Forge invocation field
      paths.
- [ ] `contextToken` is summarized with `tokenPreview`.
- [ ] `headers` and `body` are summarized with `omittedShape`.
- [ ] Missing Forge fields are omitted without requiring a Forge TypeScript
      interface.
- [ ] `summarizeForgeInvocation()` includes only policy-selected fields by
      default.
- [ ] Full event shape is included only when explicitly requested and the
      effective level is `debug` or `trace`.
- [ ] At `info` or higher, requested event shape emits
      `eventShapeOmitted: "requires debug or trace"` instead of event data.

### 06 — Implement Result and Error logging helpers

**What to build:** `logResult()`, `logError()`, `logger.result()`, and
`logger.errorResult()` integrate with `@forge-ahead/errors`, never log raw
Ok/Err payloads by default, include safe `errorName`, and gate stack traces by
effective level.

**Blocked by:** 02 — Build log level resolution and core pino logger; 04 —
Build bounded summaries and Object Summary Policies.

**Status:** ready-for-agent

- [ ] Ok results log at `debug` by default.
- [ ] Ok values are never logged raw; without `summarizeOk`, only a generic
      success marker is emitted.
- [ ] Err results log at `error` by default.
- [ ] Err values normalize through `@forge-ahead/errors` before logging.
- [ ] `summarizeOk` and `summarizeErr` metadata is merged only after normal
      summary/redaction handling.
- [ ] Existing `ProblemDetails` values log only approved problem fields.
- [ ] Non-`ProblemDetails` `Error` instances include `errorName`.
- [ ] Stack traces are included only at effective `debug` or `trace`.

### 07 — Rewrite README and package docs around the real API

**What to build:** The README reflects the logging package rather than the
copied errors package, documents `LOG_LEVEL`, redaction as a backstop,
object-first logging, Object Summary Policies, Forge invocation logging, and
Result/Error examples.

**Blocked by:** 02 — Build log level resolution and core pino logger; 03 — Add
the default redaction backstop; 04 — Build bounded summaries and Object Summary
Policies; 05 — Implement Forge invocation summaries on the policy system; 06 —
Implement Result and Error logging helpers.

**Status:** ready-for-agent

- [ ] README explains the package purpose and Forge-oriented logging stance.
- [ ] README documents `LOG_LEVEL` and local/default behavior.
- [ ] README shows object-first logger usage.
- [ ] README explains default redaction as a backstop.
- [ ] README includes Object Summary Policy and Field Transform examples.
- [ ] README includes Forge invocation and Result/Error logging examples.
- [ ] README no longer describes this package as `@forge-ahead/errors`.

### 08 — Final verification and cleanup

**What to build:** The package passes formatting, linting, type checking,
tests, and build; lingering copied-error references are gone; specs remain
aligned with the implemented behavior.

**Blocked by:** 07 — Rewrite README and package docs around the real API.

**Status:** ready-for-agent

- [ ] Format, lint, typecheck, tests, and build pass.
- [ ] Public exports match the logging spec.
- [ ] No stale copied-error package references remain in source, tests, README,
      or package metadata.
- [ ] Specs still describe the implemented package behavior.
