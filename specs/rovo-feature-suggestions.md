---
82k context used
---

# Forge Logging Feature Suggestions Inspired by Loguru

## Goal

Make `@forge-ahead/logging` convenient for routine Forge development without
weakening its current guarantees: structured logs, bounded payloads, default
redaction, and a Forge-compatible `console.*` destination.

Loguru is useful inspiration because it reduces setup friction and makes
context, failures, and diagnostic logging ergonomic. Its file-sink,
terminal-formatting, and multi-process features are not a fit for Forge.

## Current Capability Compared with Loguru

| Loguru idea                                 | Current package position                                                | Assessment                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Ready-to-use logger and level configuration | `createForgeLogger()`, `LOG_LEVEL`/`NODE_ENV` resolution, safe defaults | Covered.                                                                                     |
| Standard levels plus `trace`                | `fatal` through `trace`, plus `silent`                                  | Covered; do not add custom levels.                                                           |
| Structured records and bound context        | Object-first methods and `logger.child()`                               | Partially covered: explicit child loggers work, but scoped async context is absent.          |
| JSON/structured output                      | Pino JSON records routed through Forge-captured `console.*` methods     | Covered for Forge; configurable sinks/formatters would break the runtime contract.           |
| Exception capture                           | `logError()`, `logResult()`, and error-aware probes                     | Partially covered: callers must remember to invoke them at each boundary.                    |
| Lazy diagnostics                            | `logProbe()` avoids probe metadata computation when disabled            | Partially covered: normal `debug()`/`trace()` calls eagerly build metadata.                  |
| Per-record enrichment                       | Child bindings only                                                     | Partially covered: no controlled integration point for stable, dynamic correlation metadata. |
| Filtering and multiple sinks                | A single Forge console destination                                      | Deliberately out of scope: Forge owns collection, retention, and presentation.               |
| Detailed exception variable introspection   | Stack is gated behind debug/trace                                       | Intentionally safer than Loguru; never capture local variables automatically.                |

The package already has stronger Forge-specific safety primitives than Loguru:
Object Summary Policies, bounded summarization, default secret-shaped-key
redaction, and a specialized Forge invocation summary. The highest-value work
therefore removes usage friction around those primitives instead of adding a
second logging framework on top of Pino.

## Prioritized Improvements

### P0 — Request-scoped context for an invocation

**Problem.** `logger.child({ requestId, cloudId, ... })` is effective, but a
Forge handler must thread the child logger through every asynchronous helper.
This creates boilerplate and makes it easy to lose correlation fields.

**Proposal.** Add an explicit asynchronous scope, backed by `AsyncLocalStorage`
when supported by the Forge Node runtime. The root logger remains usable, but
records created while a scope is active automatically merge its bindings.

```ts
await withLogContext(logger, { requestId, cloudId, moduleKey }, async () => {
  logger.info({ operation: "createIssue" }, "starting");
  await createIssue();
});
```

Or, if a method surface is preferable:

```ts
await logger.withContext({ requestId, cloudId }, () => createIssue());
```

**Acceptance criteria.** Nested scopes merge predictably (inner keys override
outer keys), concurrent async invocations never share fields, scope exit
restores the prior context, and all scoped values still go through Pino
redaction. Keep the context explicit: do not automatically log an entire Forge
event or request.

**Why first.** It makes the existing structured API substantially easier to use
in real handlers, resolvers, queues, and scheduled functions, without adding
record volume or a new logging convention.

### P0 — Boundary wrapper that logs and rethrows unexpected failures

**Problem.** `logError()` is safe and useful, but errors escape a Forge entry
point unless every handler remembers to call it. Loguru's `catch()` is valuable
because it makes this boundary behavior easy to apply consistently.

**Proposal.** Add a narrowly scoped wrapper for async Forge entry points:

```ts
const handler = withErrorLogging(logger, "issue.create", async (event) => {
  return createIssue(event);
});
```

On rejection it should log one structured error record containing an
`operation` field and the current scoped context, then rethrow the _same_
error. Offer an option only for safe, bounded extra metadata or a caller-owned
summary policy; do not serialize raw events.

**Acceptance criteria.** Preserve successful values and thrown/rejected object
identity; log exactly once for a failure; honor `LogErrorOptions` and the
existing debug/trace stack gate; work with nested context; never convert an
error into a successful result.

**Why first.** It prevents a common observability failure at the most important
application boundary while preserving the package's existing error model.

### P0 — Lazy metadata for normal verbose logging

**Problem.** A `debug()` or `trace()` call can construct expensive summaries
before Pino decides that its level is disabled. `logProbe()` already proves the
package needs and can support conditional diagnostic evaluation.

**Proposal.** Add a clearly named verbose helper rather than overloading Pino's
object-first methods with ambiguous callback behavior:

```ts
logger.debugLazy(() => ({
  message: "resolved configuration",
  metadata: summarizeConfig(config),
}));
```

The factory executes only if the requested level is enabled. Its output is
passed through `summarizeForLog()` before emission. Start with `debugLazy()` and
`traceLazy()`; evaluate a generic `logger.lazy(level, factory)` only if usage
shows the two named methods are repetitive.

**Acceptance criteria.** Factories do not run when disabled, run once when
enabled, preserve child and scoped context, redact and bound returned metadata,
and do not swallow factory failures.

**Why first.** It extends an existing successful pattern to ordinary diagnostic
logging, reducing both production cost and pressure to write unsafe ad hoc
logging.

### P1 — Safe operation/timing helper

**Problem.** Developers often need consistent start, success, failure, and
duration records around a remote request or expensive Forge operation. Doing it
manually produces inconsistent names and risks logging result payloads.

**Proposal.** Add `logger.operation()` (or `logOperation()`) that wraps a
thunk, emits a completion record at `debug` by default, and emits failures via
the existing error metadata path:

```ts
const issue = await logger.operation("jira.issue.create", () =>
  api.asApp().requestJira(...),
);
```

Options should allow safe static metadata and opt-in result summary functions,
not raw result logging. Include `operation`, `outcome`, and `durationMs` fields.

**Acceptance criteria.** Preserve sync/async behavior and values, rethrow the
same error, avoid work when the success level is disabled, and use a monotonic
clock for duration.

**Why second.** It is more opinionated than failure capture, but it creates
uniform operational records that are valuable in the Forge developer console.

### P1 — Controlled dynamic record enrichment

**Problem.** Consumers integrating tracing or tenancy metadata sometimes need
stable data on every record. `child()` handles static bindings, but repeatedly
creating children or unwrapping Pino exposes an implementation detail and can
bypass package conventions.

**Proposal.** Provide an opt-in `recordMetadata` callback in
`ForgeLoggerOptions`. It returns a small metadata object immediately before a
record is emitted. Document it for correlation IDs from a tracing context, not
for request payloads.

```ts
createForgeLogger({
  recordMetadata: () => ({ traceId: currentTraceId() }),
});
```

**Acceptance criteria.** Callback output is summarized/redacted, runs only for
an enabled record, cannot overwrite structural Pino fields or explicit log
metadata without a documented precedence rule, and callback errors do not
break application code (omit metadata and write a minimal fallback record).

**Why second.** It offers a safe integration seam similar to Loguru's `patch()`
without allowing callers to mutate arbitrary record internals.

### P2 — Ergonomic configuration diagnostics and framework adapters

**Problem.** A misspelled `LOG_LEVEL` is intentionally side-effect free today,
so developers may not notice it. Separately, common Forge boundaries would
benefit from small, explicit adapters rather than broad magic.

**Proposal.**

- Add `logger.configuration()` or a standalone `getLoggerDiagnostics()` that
  returns the resolved level source and invalid configured value. Applications
  choose whether and when to emit it.
- After the P0 APIs have proven their shape, add optional adapters for the
  highest-frequency entry points (for example, resolver or web-trigger
  boundaries) that derive _only_ allow-listed invocation context.

**Why later.** These improve onboarding but should not dictate a framework
architecture before the generic context and error APIs are validated.

## Explicit Non-Goals

Do **not** copy these Loguru features into this package:

- **File sinks, rotation, retention, compression, parsing, or custom output
  formatting.** Forge captures `console.*`; platform tooling owns storage and
  display.
- **Terminal colors, icons, or prettified human log layouts.** They provide
  little value in the Forge CLI/developer console and degrade structured search.
- **Multi-process queues, async sink draining, or shutdown completion.** They
  solve file/worker sink delivery problems outside the Forge console model.
- **Custom severity levels.** The stable level set supports predictable
  configuration, alerting, and tests.
- **Automatic call-site capture or local-variable exception diagnostics.** These
  add cost and are high-risk for secret leakage; retaining gated stack traces is
  the safer choice.
- **Global mutable context or automatic raw-event capture.** Both can leak data
  between concurrent invocations or turn the redaction backstop into the
  primary safety mechanism.

## Delivery Order and Validation

1. Ship P0 capabilities independently, each with public-interface tests for
   disabled levels, async concurrency, child/scoped binding precedence,
   redaction, error identity, and output record shape.
2. Validate P0 in one representative resolver and one asynchronous web/queue
   handler before adding P1 convenience APIs.
3. Add P1 operation timing and enrichment only after documenting field names
   and overwrite precedence as a stable record contract.
4. Revisit P2 after downstream package adoption identifies which Forge boundary
   adapter has repeated demand.

This sequence preserves the library's current small, production-safe surface
while adopting the parts of Loguru that improve day-to-day developer
experience: less setup, durable context, dependable error visibility, and
cheap diagnostics.

## References

- Loguru overview and feature tour: https://loguru.readthedocs.io/en/stable/overview.html#features
- Loguru logger API (`catch`, `contextualize`, `patch`, and lazy options): https://loguru.readthedocs.io/en/stable/api/logger.html
- Existing package API and safety behavior: `src/index.ts`, `README.md`, and
  `CONTEXT.md`
