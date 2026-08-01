---
>_ OpenAI Codex (v0.141.0)                                                 │
│                                                                             │
│ Visit https://chatgpt.com/codex/settings/usage for up-to-date               │
│ information on rate limits and credits                                      │
│                                                                             │
│  Model:                  gpt-5.5 (reasoning xhigh, summaries auto)          │
│  Directory:              ~/dev/git/github.com/ibuchanan/forge-ahead-logging │
│  Permissions:            Workspace (Ask for approval)                       │
│  Agents.md:              <none>                                             │
│  Account:                ibuchanan@atlassian.com (Enterprise)               │
│  Collaboration mode:     Default                                            │
│  Session:                019fbdc5-f245-7b12-80a6-adcd8096fcc8               │
│                                                                             │
│  Context window:         76% left (70.8K used / 258K)                       │
│  Monthly credit limit:   [████████████████████] 100% left                   │
│                          (resets 19:00 on 31 Aug)                           │
│                          0 of 50,000 credits used                           │
│  Warning:                limits may be stale - run /status again shortly.
---

# DX Improvements Inspired by Loguru

## Status

Draft proposal.

## Inputs

- Prompt: `specs/dx-like-loguru.md`.
- Inspiration source: [Loguru feature overview](https://loguru.readthedocs.io/en/stable/overview.html#features).
- Current package evidence: `README.md`, `src/index.ts`, and tests under `test/`.

## Current Baseline

`@forge-ahead/logging` is already a focused Forge logging wrapper around Pino,
not a general-purpose logger. Its strongest current DX positions are:

- `createForgeLogger()` works out of the box with Forge-compatible console
  output.
- Level resolution is consistent through `LOG_LEVEL`, `NODE_ENV`, and a safe
  default.
- Log calls are structured and object-first rather than string-first.
- Default redaction provides a backstop for common secret-shaped fields.
- Object Summary Policies allow safe, bounded, allow-listed projections of
  rich values.
- Forge invocation helpers summarize risky Forge event payloads without raw
  `body`, `headers`, or `contextToken`.
- Result and Error helpers normalize errors into approved Problem Details
  fields and gate stacks behind debug/trace.
- Debug Probe supports pass-through inspection and lazy probe metadata.

That is a good Forge-safe core. The main DX gap is not log expressiveness; it is
removing the repetitive wrapper code every Forge developer writes around
invocations, request context, error boundaries, and temporary diagnostics.

## Loguru Feature Comparison

| Loguru idea                                                | Current coverage                                                        | DX opportunity for this package                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Ready to use out of the box                                | Mostly covered by `createForgeLogger()`                                 | Add stronger recipes and app/resolver presets so a new Forge app has an obvious default wiring path.                             |
| One `add()` for handlers, formatting, filtering, and level | Partially covered by one `createForgeLogger()` option bag               | Add clearer configuration presets before adding arbitrary sink complexity. Forge should keep console output as the primary sink. |
| File rotation, retention, compression                      | Not covered                                                             | Low fit for Forge runtime. Defer unless local CLI or non-Forge consumers become a goal.                                          |
| Brace-style string formatting                              | Not covered and intentionally de-emphasized                             | Avoid string-template-first APIs. Prefer structured metadata and optionally add lazy metadata helpers instead.                   |
| `catch()` decorator/context manager                        | Partially covered by manual `logError()`                                | High-value gap. Add async-safe wrappers for Forge handlers and arbitrary functions.                                              |
| Colors                                                     | Not covered                                                             | Not useful for Forge console/developer-console logs. Do not prioritize.                                                          |
| Async/thread/multiprocess-safe sinks                       | Pino handles normal Node logging; no package-level queue                | Low fit for Forge. Avoid inventing a queue unless production evidence shows dropped logs.                                        |
| Descriptive exceptions                                     | Partially covered: Problem Details, error name, debug-gated stack       | Add safe cause-chain and aggregate-error summaries. Do not add local-variable diagnostics because they risk customer-data leaks. |
| Structured logging, `bind()`, `contextualize()`, `patch()` | Partially covered by object-first calls and `child()`                   | High-value gap. Add request-scoped context propagation and per-record patch hooks with safe summary/redaction.                   |
| Lazy evaluation                                            | Covered only for Debug Probe metadata                                   | High-value gap. Add generic lazy structured logging gated by effective level.                                                    |
| Custom levels                                              | Pino levels exposed: fatal/error/warn/info/debug/trace/silent           | Low value. Avoid custom levels unless a Forge-specific semantic level proves useful.                                             |
| Better datetime handling                                   | Pino/platform timestamps are implicit, not a documented package feature | Low-to-medium value. Prefer documenting timestamp expectations before changing output shape.                                     |
| Scripts and libraries                                      | Partially covered by explicit logger creation and private package use   | Add null logger and library guidance so packages can accept a `ForgeLogger` without owning global logging setup.                 |
| Standard logging compatibility                             | Escape hatch exists through `unwrapPinoLogger()`                        | Add adapters only if concrete downstream libraries need them.                                                                    |
| Environment defaults                                       | Covered for `LOG_LEVEL` only                                            | Keep narrow. More environment-driven formatting would make Forge logs less consistent.                                           |
| Parser                                                     | Not covered                                                             | Useful for tests and local analysis of `forge logs` JSON lines.                                                                  |
| Notifier                                                   | Not covered                                                             | Poor fit. Prefer external observability tools and alerting integrations outside this package.                                    |
| Performance focus                                          | No benchmark or cost-oriented helpers beyond level gating               | Add lazy logging and optional sampling/rate-limit helpers if noisy Forge paths need them.                                        |

## Prioritized Improvements

### P0: Logged Forge Handler Wrappers

Add wrapper helpers that combine invocation summary logging, duration, success
metadata, and exception logging around Forge resolver/web-trigger functions.

Sketch:

```ts
const handler = withForgeLogging(logger, async (event) => {
  return doWork(event);
});
```

Candidate API:

```ts
export interface WithForgeLoggingOptions<TEvent, TResult> {
  message?: string | ((event: TEvent) => string);
  includeEventShape?: boolean;
  successLevel?: "debug" | "info";
  errorLevel?: "warn" | "error" | "fatal";
  summarizeResult?: (result: TResult) => Record<string, unknown>;
}

export function withForgeLogging<TEvent, TResult>(
  logger: ForgeLogger,
  handler: (event: TEvent) => TResult | Promise<TResult>,
  options?: WithForgeLoggingOptions<TEvent, TResult>,
): (event: TEvent) => TResult | Promise<TResult>;
```

Why this is first: it maps directly to Loguru's `catch()` idea and removes the
highest-risk copy/paste pattern in Forge apps. Developers should not have to
remember to call both `logForgeInvocation()` and `logError()` correctly.

Acceptance criteria:

- Logs the existing Forge invocation summary at entry or completion without raw
  payloads.
- Logs duration in milliseconds.
- Logs thrown/rejected errors using the existing safe error metadata path.
- Rethrows the original error and preserves the original return value.
- Never includes full event shape unless debug/trace is enabled, matching the
  existing `includeEventShape` behavior.

### P0: Request-Scoped Log Context

Add a `bind()`/`contextualize()` equivalent using Node's async context so
request identifiers and Forge invocation metadata can flow through deep call
stacks without passing child loggers everywhere.

Sketch:

```ts
await withLogContext({ requestId, cloudId }, async () => {
  logger.info({ step: "lookup" }, "loading issue");
});
```

Candidate API:

```ts
export function withLogContext<T>(
  bindings: Record<string, unknown>,
  operation: () => T | Promise<T>,
): T | Promise<T>;

export function getLogContext(): Record<string, unknown>;
```

Why this is first: Forge handlers are async-heavy, and missing correlation
fields make production logs hard to use. This is the Loguru `bind()` and
`contextualize()` lesson translated into Node/Forge.

Acceptance criteria:

- Context fields are merged into every record emitted by `ForgeLogger` methods.
- Explicit per-call metadata wins over context on key collisions.
- `child()` bindings continue to work.
- Context is isolated across concurrent async invocations.
- Context values are summarized/redacted before logging.

### P0: Generic Lazy Logging

Add level-gated lazy metadata for normal log records, not just Debug Probe
metadata.

Sketch:

```ts
logger.debugLazy("computed expensive diagnostic", () => ({
  issueShape: summarizeForLog(issue),
  queryPlan: expensiveExplain(),
}));
```

Candidate API:

```ts
type LazyLogMethod = (
  message: string,
  metadata: () => Record<string, unknown>,
) => void;
```

Why this is first: Forge logging has both cost and data-risk constraints.
Developers need a supported way to leave debug diagnostics in place without
building expensive payloads at `info`.

Acceptance criteria:

- Metadata thunk is not called when the level is disabled.
- Metadata is still passed through existing Pino redaction.
- Errors thrown by the thunk are logged safely or allowed to propagate by a
  documented policy.
- The API remains object-first; it should not introduce string interpolation as
  the preferred pattern.

### P1: Safe Error Detail Upgrades

Improve descriptive exceptions without copying Loguru's local-variable
diagnostics.

Candidate behavior:

- Include `cause` chains as bounded arrays of `{ errorName, detail }`.
- Summarize `AggregateError` with bounded child error summaries.
- Preserve the existing debug/trace gate for stacks.
- Consider an opt-in `includeStack: "debug" | "never"` option on error helpers.

Why not P0: current error logging is already safe and useful. This improves
debuggability but is less fundamental than wrapping and context propagation.

### P1: Forge Logger Presets and Recipes

Make the "one function to rule them all" idea more discoverable without adding
an unconstrained `add()` sink system.

Candidate additions:

- `createForgeAppLogger({ name })` as a named recipe over `createForgeLogger()`.
- README recipes for resolver, web-trigger, scheduled trigger, queue consumer,
  and library package usage.
- A documented "minimum production setup" including `LOG_LEVEL` wiring and
  redaction guidance.

Why P1: this improves first-run success and library adoption, but the existing
factory already works.

### P1: Log Parsing and Test Utilities

Add utilities for parsing Forge/Pino JSON lines captured from console output,
test helpers, or `forge logs` output.

Sketch:

```ts
const record = parseForgeLogLine(line);
expectForgeLog(record).toHaveKind("forgeEvent");
```

Candidate exports:

- `parseForgeLogLine(line: string): ForgeLogRecord | undefined`
- `parseForgeLogLines(text: string): ForgeLogRecord[]`
- `createMemoryLogSink()` or a supported test capture helper

Why P1: Loguru's parser is useful because logs become data again. For this
package, parsing is most valuable in tests, demos, and local debugging.

### P2: Pino Interop Adapters

Keep `unwrapPinoLogger()` as the main escape hatch, but add adapters only where
downstream usage proves repetitive.

Possible adapters:

- Convert a `pino.Logger` into a restricted `ForgeLogger`.
- Accept a `ForgeLogger` in libraries and provide `createNullForgeLogger()` for
  consumers that want silence by default.

Why P2: arbitrary interop can dilute the Forge-safe API. Add only small,
well-tested adapters with clear use cases.

### P2: Timestamp Policy Documentation

Document what timestamp fields appear in logs today, how Forge presents them,
and whether applications should rely on platform timestamps or Pino timestamps.

Why P2: Loguru emphasizes datetime formatting, but Forge developers usually need
consistent machine-readable records more than customizable timestamps.

### P2: Cost Controls

Consider sampling or one-shot logging helpers for noisy diagnostic paths.

Sketch:

```ts
logger.debugSampled({ sampleRate: 0.01 }, () => ({ expensive: true }));
logger.warnOnce({ key: "missing-config" }, "configuration missing");
```

Why P2: this fits Forge cost constraints, but it should follow real downstream
evidence so the package does not accumulate policy-heavy knobs too early.

## Deliberately Not Recommended

- File rotation, retention, and compression in the Forge runtime.
- Color formatting.
- Local-variable exception diagnostics.
- Broad custom log levels.
- Notification delivery from inside this logging package.
- A general replacement for Pino transports before there is a concrete Forge
  need.

## Suggested Implementation Order

1. Add `withForgeLogging()` with tests for sync success, async success, sync
   throw, async rejection, duration, and `includeEventShape` gating.
2. Add `withLogContext()` and merge active context in `wrapPinoLogger()` before
   delegating to Pino.
3. Add lazy log methods or a small `logger.ifLevel()` helper, then migrate
   Debug Probe internals to reuse the same enabled-level check.
4. Upgrade error metadata for `cause` and `AggregateError`.
5. Add README recipes and, only after API shape stabilizes, parsing/test helper
   exports.

## Open Design Questions

- Should `withForgeLogging()` log invocation start, completion, or both by
  default? Completion-only produces fewer records and can include duration;
  start-plus-completion helps diagnose timeouts but doubles log volume.
- Should request-scoped context use `AsyncLocalStorage` directly, or should the
  package first expose an explicit `logger.bind()` method that returns child
  loggers? Async context is more ergonomic; child loggers are simpler and more
  explicit.
- Should lazy logging be level-method-specific (`debugLazy`) or generic
  (`logger.ifLevel("debug", ...)`)? The generic form is smaller, but
  level-specific methods are more discoverable.
