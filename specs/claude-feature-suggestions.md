---
Session

  Total cost:            $1.92
  Total duration (API):  5m 46s
  Total duration (wall): 24m 40s
  Total code changes:    423 lines added, 0 lines removed
  Usage by model:
      claude-haiku-4-5:  7.2k input, 1.8k output, 0 cache read, 0 cache write
  ($0.0164)
         claude-opus-5:  120 input, 22.9k output, 869.4k cache read, 90.0k cache
  write ($1.91)
  
---

# Forge Logging DX Improvements Inspired by Loguru

## Status

Draft. Independent response to [dx-like-loguru.md](dx-like-loguru.md).
Analysis and prioritization only — no implementation included.

Two other drafts answering the same prompt exist in this directory
(`dx-like-loguru-proposal.md`, `rovo-feature-suggestions.md`). This one was
written without reference to their conclusions; see [Where this draft
differs](#where-this-draft-differs) for the points of genuine disagreement.

## Context

`@forge-ahead/logging` is strong on _safety_ — allow-list summaries, a redaction
backstop, level-gated payloads, cost-aware defaults — and thin on _ergonomics_.
loguru's appeal is almost entirely ergonomic: one import, no boilerplate, and
context that follows you around.

That asymmetry is the whole finding. Nearly every loguru feature this package
lacks is a friction reducer, and nearly every loguru feature it should _not_
adopt trades safety or cost for convenience — exactly the trade a Forge app
cannot make. So the proposal is biased toward removing ceremony from the
existing safe paths rather than adding new capability.

One observation worth stating up front, because it reframes the priorities: the
package's safe helpers are all _reachable but effortful_, while the unsafe path
(`console.log`, or `logger.info({}, ...)` with a hand-built payload) is
effortless. Closing that effort gap is worth more than any new feature.

## Feature-by-feature comparison

| loguru feature                                    | State here                                        | Verdict                                             |
| ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Zero-boilerplate `from loguru import logger`      | Must call `createForgeLogger()`                   | Adopt (1.5)                                         |
| One `add()` for sinks, filters, levels            | Single hardwired Forge console destination        | Partially adopt (1.4, 3.11)                         |
| File rotation / retention / compression           | Absent                                            | Non-goal                                            |
| Brace-style message formatting                    | Object-first only; `{}` required                  | Reject formatting; fix `{}` (1.1)                   |
| `@logger.catch`                                   | Manual `logError()` in `catch`                    | Adopt (2.8)                                         |
| Colors                                            | Absent                                            | Non-goal (stated in the request)                    |
| `enqueue=True` async/multiprocess safety          | Deliberately synchronous                          | Anti-goal                                           |
| `backtrace` / `diagnose`                          | Stack at `debug`+ only; no cause chain, unbounded | Adopt cause chain + bounds (2.9); reject `diagnose` |
| `bind()`                                          | `child(bindings)`                                 | Already covered                                     |
| `contextualize()`                                 | Absent                                            | Adopt (2.7) — largest single win                    |
| `patch()` (per-record dynamic fields)             | Absent                                            | Adopt (3.11)                                        |
| `opt(lazy=True)`                                  | Only `logProbe`'s `metadata` thunk                | Adopt (1.2)                                         |
| Custom levels                                     | Fixed pino levels                                 | Reject; add `logger.log()` (1.6)                    |
| Better datetime handling                          | pino epoch ms                                     | Adopt as opt-in (3.14)                              |
| `configure()`, `disable()`/`enable()` per library | Absent                                            | Adopt as namespace levels (2.10)                    |
| Compatible with stdlib `logging`                  | No `console.*` capture                            | Adopt cautiously (3.12)                             |
| Env-var defaults                                  | `LOG_LEVEL`, `NODE_ENV` only                      | Adopt narrowly (3.15)                               |
| `logger.parse()`                                  | Absent                                            | Adopt as a `forge logs` reader (3.13)               |
| Notifier integrations                             | Absent                                            | Non-goal                                            |

## Priority 1 — Ceremony removal

High value, low cost, no new domain concepts. These are what a new Forge
developer feels in the first ten minutes. They are deliberately ranked above the
handler wrapper and context propagation, because they are the changes most
likely to stop someone reaching for `console.log`.

### 1.1 Message-only level calls

Goal: `logger.info("handled request")` instead of `logger.info({}, "handled
request")`.

Every level method demands a metadata object, so message-only logging — the most
common call in early development — carries a `{}` that means nothing. Widen
`LogMethod` to accept either a message alone or the existing object-first form.
Object-first stays the documented default so structured logging remains the
primary interface; this only removes the placeholder.

Acceptance criteria:

- `logger.info("msg")` and `logger.info({ a: 1 }, "msg")` both type-check and
  emit equivalent records apart from metadata.
- README continues to present object-first as the recommended shape.
- No `msg`-key collision when metadata already contains `msg`.

### 1.2 Level checks and lazy metadata on every level method

Goal: expensive metadata is never computed for a disabled level, without
reaching for `unwrapPinoLogger()`.

`logProbe` already proves the pattern — its `metadata` thunk runs only when the
level is enabled — but ordinary level methods have no equivalent, and the only
way to ask "is `debug` on?" is to unwrap the pino instance. That is an escape
hatch doing routine work; `isVerboseLevelEnabled` and `isProbeLevelEnabled` in
`src/index.ts` are the package's own evidence for the gap.

Candidate work:

- Add `isLevelEnabled(level: ForgeLogLevel): boolean` to `ForgeLogger`.
- Accept a zero-argument thunk in the metadata position:
  `logger.debug(() => ({ expensive: compute() }), "msg")`.
- Migrate the two internal helpers onto the public method.

Prefer the thunk-in-metadata-position form over parallel `debugLazy()` methods:
it keeps one method per level rather than fourteen, and it reads as an ordinary
log call.

Acceptance criteria:

- A metadata thunk is not invoked when its level is disabled.
- `isLevelEnabled` agrees with the resolved `LOG_LEVEL` for all seven levels.
- A thunk that throws does not break the caller; document whether it is swallowed
  or propagated, and test that choice.

### 1.3 Level names in records

Goal: `"level": "info"` instead of `"level": 30`.

Records are read by humans in `forge logs` and the developer console far more
often than by machines. Numeric pino levels are the single largest readability
cost in current output, and `createForgeDestination()` already maps level numbers
to console methods internally, so nothing inside this package depends on the
numeric form surviving into the record.

Candidate work:

- Configure `formatters.level` to emit the label.
- Note it in CHANGELOG as output-shape-affecting for any downstream parser.

Acceptance criteria:

- Every emitted record carries a string level matching `ForgeLogLevel`.
- Console-method routing per level is unchanged.

### 1.4 A supported testing surface

Goal: consumers can assert on log records without reimplementing capture.

`test/helpers/capture-forge-logger-output.ts` exists but is private, so every
downstream app that wants to test its own logging writes that helper again. This
is loguru's "suitable for scripts and libraries" claim in its most practical
form, and it is the cheapest way to make this package's safety guarantees
verifiable _in the consuming app_ rather than only here — a consumer should be
able to prove their own payload is redacted.

Candidate work:

- Publish `@forge-ahead/logging/testing` exporting roughly
  `createCapturingLogger(options?): { logger: ForgeLogger; records: Record<string, unknown>[] }`.
- Keep it a separate subpath, for the reasons in
  [ADR 0001](../docs/adr/0001-demo-narrative-logging-subpath.md).
- Records must pass through the real redaction and summary path, so tests
  observe production behavior rather than a stub's.

Acceptance criteria:

- A consumer can assert a field was redacted using only public exports.
- The testing subpath is absent from the root export.

### 1.5 Zero-config default logger

Goal: `import { log } from "@forge-ahead/logging"` works with no setup.

loguru's headline feature. A lazily created module-level logger costs little and
gives a developer a working structured log line before they learn any of this
package's concepts. `createForgeLogger()` remains the path for named loggers,
custom redaction, and injected `env`.

Acceptance criteria:

- Created on first use, not at import time, so `LOG_LEVEL` resolution is not
  frozen before Forge variables are readable.
- Records are indistinguishable from `createForgeLogger()` with no options.

### 1.6 Dynamic-level logging

Goal: `logger.log(level, obj, message?)` for code that computes severity.

Cheaper and safer than loguru's custom levels: it reuses the seven existing
levels rather than inventing ones the console-method mapping and the log viewer's
filters would not understand.

## Priority 2 — Structural wins

Real design work, each replacing something Forge developers currently hand-write
in every app.

### 2.7 Ambient Log Context

Goal: set `cloudId`, `accountId`, and `requestId` once per invocation and have
every record anywhere in the call stack carry them, without threading a logger
through every function signature.

This is loguru's `contextualize()`, and it is the highest-value item here.
`child(bindings)` covers `bind()` well, but it only helps code that already holds
a logger. In practice a resolver calls into service and client modules that
either accept a logger parameter they need for nothing else, or log without
invocation identity — and identity-less records are the ones that cost the most
time during an incident.

Candidate work:

- `withLogContext(bindings, () => work())` backed by `AsyncLocalStorage`, merging
  ambient bindings into every record emitted inside the callback.
- Explicit `child()` and per-call bindings win over ambient bindings on key
  collision.
- Ambient bindings pass through `summarizeForLog()` like all other metadata.
- Spike first: confirm `node:async_hooks` behaves in the Forge runtime and
  survives the platform's async boundaries. The runtime reference documents only
  `nodejs20.x`/`22.x`/`24.x` without enumerating built-in module support, so this
  is an assumption, not a known. If it fails, fall back to an invocation-scoped
  logger created by 2.8, and record the outcome in an ADR.

Acceptance criteria:

- A record emitted three call frames deep, by a logger with no bindings, carries
  the ambient context.
- Concurrent invocations do not observe each other's context.
- Context is empty outside any `withLogContext` scope and never leaks after one.

Proposed term for CONTEXT.md — **Ambient Log Context**: invocation-scoped
bindings that attach to every log record produced within a scope without being
passed through application signatures. _Avoid_: global logger state, mutable
logger, request singleton.

### 2.8 Invocation wrapper

Goal: one wrapper covering entry logging, duration, and failure — loguru's
`@logger.catch` combined with its `elapsed` record field.

Every Forge app writes this by hand: log the invocation, `try`/`catch`, log the
error, rethrow. Duration usually gets skipped, even though invocation time is
directly cost-metered on Forge and is the number most worth having.

Candidate work:

- `logger.invocation(event, handler)`, or standalone
  `withForgeInvocationLogging(logger, event, handler)`, that summarizes the event
  through `FORGE_EVENT_SUMMARY_POLICY`, runs the handler, and logs completion
  with `durationMs` and outcome.
- Failures log through the existing Problem Details path and rethrow — never
  swallow, on the same principle as `logProbe`.
- A `Result` return value routes through `logResult()` rather than counting as
  plain success. This matters: an app using `@forge-ahead/errors` returns
  failures rather than throwing them, so a wrapper that only catches throws would
  report `Err` as success.
- Default to one completion record, not entry-plus-completion: completion can
  carry duration and outcome, and doubling record count in a cost-metered runtime
  needs a better reason than symmetry. Make entry logging opt-in for timeout
  diagnosis.
- Compose with 2.7 so the handler body inherits Ambient Log Context.

Acceptance criteria:

- Success and failure each emit exactly one completion record with `durationMs`.
- Thrown values propagate unchanged; `Result` values are classified correctly.
- Entry logging, when enabled, respects the existing `level` and
  `includeEventShape` gates.

### 2.9 Error cause chains and bounded stacks

Goal: see why an error happened, without paying for or leaking a full trace.

`buildErrorMetadata()` handles the top-level error well but ignores
`Error.cause` and `AggregateError.errors`, so the wrapped-error style
`@forge-ahead/errors` encourages loses its most useful diagnostic layer. Stacks
are also emitted whole at `debug`, which is unbounded output in a cost-metered
runtime — the one place this package's otherwise consistent bounding discipline
has a hole.

Candidate work:

- A bounded `causeChain` array of approved fields per link, with a depth cap and
  cycle guard mirroring `summarizeForLog()`.
- Bound emitted stacks to a configurable frame count with an explicit
  `[N frames omitted]` marker, matching the package's existing truncation
  vocabulary.
- Do **not** adopt loguru's `diagnose=True` variable capture: local variables in
  a Forge app are customer data by default.

Acceptance criteria:

- A three-deep `cause` chain logs three bounded links.
- A cyclic `cause` terminates.
- Stack output has a documented upper bound.

### 2.10 Namespace level overrides

Goal: turn on `debug` for one module in production without paying for a
whole-app firehose.

loguru's `disable("my_library")`/`enable()` exists to keep library noise out of
application logs. On Forge the same mechanism answers a sharper question: the
README states debug logging is a cost problem, which makes the useful unit of
opt-in not "the app" but "the part of the app I am debugging right now." A single
global `LOG_LEVEL` forces the expensive choice, so in practice people either
leave debug off and stay blind, or turn it on and pay for everything.

Candidate work:

- Extend `LOG_LEVEL` parsing to accept per-name overrides, e.g.
  `LOG_LEVEL="info,my-lib=debug"`, resolved against `createForgeLogger({ name })`
  and `child()` name bindings.
- `resolveLogLevel()` keeps reporting `source` and `invalidValue`; unparsable
  segments fall back rather than throwing, as today.
- If the accepted format changes, update the `repo-init` and `forge-prelint`
  follow-ups in [downstream-integration-work.md](downstream-integration-work.md),
  which both assert on `LOG_LEVEL`.

Acceptance criteria:

- A plain `LOG_LEVEL=debug` behaves exactly as today.
- An override applies to the named logger and its children only.
- An invalid segment is reported, not fatal.

Proposed term for CONTEXT.md — **Namespace Level Override**: a per-logger-name
level set alongside the global `LOG_LEVEL`, so short-lived debug logging can be
scoped to one module instead of the whole app. _Avoid_: logger blacklist,
per-file config.

## Priority 3 — Worthwhile, larger, or riskier

### 3.11 `configure()` and dynamic bindings

loguru's `configure()` plus `patch()`. App-wide defaults (redaction, summary
bounds, base bindings) set once, and a `dynamicBindings?: () =>
Record<string, unknown>` option — pino's `mixin` — for fields recomputed per
record. Largely subsumed by 2.7 for the context case; keep it for the
non-context case, such as a per-record sequence number.

### 3.12 `console.*` capture

loguru's stdlib-`logging` interception. Third-party dependencies in a Forge app
log via `console.log`, bypassing structure, summarization, and redaction
entirely. That is arguably the largest remaining leak path in a real app, and
nothing in the current design addresses it.

Risk to design around: `createForgeDestination()` writes _through_ `console.*`,
so naive interception recurses infinitely. Any implementation must capture the
original method references at install time and route its own output through them.
Ship behind an explicit opt-in call, never on by default.

### 3.13 A `forge logs` reader

loguru's `parse()`. Output is NDJSON, so `forge logs | <reader>` could give
readable, level-filtered, field-projected output aware of this package's own
record shapes (`debugProbe`, `demoNarrativeStep`, `kind`). Genuinely useful, but
it is a new binary with its own release surface, and 1.3 delivers most of the
readability benefit for a fraction of the cost. Revisit only if 1.3 proves
insufficient.

### 3.14 Timestamp format option

loguru's datetime handling. Offer opt-in ISO-8601 timestamps for humans reading
raw output — opt-in rather than default, since changing `time` breaks any
downstream parser.

### 3.15 Narrow env-var diagnostic toggles

loguru's `LOGURU_*` variables. The Forge-relevant case is enabling a bounded
diagnostic — label inclusion, or `includeEventShape` — for a short window without
editing code and redeploying. Must stay default-off and remain subordinate to the
existing `debug`/`trace` gate, so an env var can never widen what a level already
refuses to emit.

## Non-goals

Recorded explicitly, because each is a reasonable loguru feature that would be
wrong here.

- **Colors** — the developer console and CLI render output; escape codes are
  noise in captured logs. (Stated in the original request.)
- **File rotation, retention, compression** — Forge functions have no durable
  local filesystem, and logs leave via the platform.
- **`enqueue=True` / buffered async sinks** — actively harmful, not merely a poor
  fit. Commits 8ddba8e and 832ccc2 forced a synchronous, console-routed
  destination precisely because buffered output is dropped when the isolate
  freezes. loguru's advice inverts on Forge, and that inversion is worth a
  README note so nobody re-adds it.
- **Brace-style message interpolation** — it moves data out of fields and into
  message strings, where redaction and Object Summary Policies cannot see it.
  1.1 removes the ceremony that makes interpolation tempting.
- **`diagnose=True` variable capture** — local variables in a Forge app are
  customer data by default.
- **Custom levels** — the console-method mapping and the Forge log viewer both
  assume the standard set. 1.6 covers the real need.
- **Notifier integrations** — alerting belongs to an observability pipeline
  reached through declared egress, not to a logging library.
- **Sampling and rate limiting** — tempting on cost grounds, but it makes a
  record's absence ambiguous, which is worse than volume during an incident. 2.10
  is the better cost lever: scope debug logging rather than randomly drop it.

## Suggested sequencing

1. Priority 1 as one minor release. Small, independent, mostly additive; 1.3 is
   the only output-shape change.
2. Spike `AsyncLocalStorage` in a deployed Forge function. Its result decides the
   shape of 2.7 and 2.8, which are best designed together.
3. 2.9 and 2.10 independently, in either order.
4. Revisit Priority 3 after 1.x and 2.x have been used in a real app. 3.11 and
   3.13 may prove unnecessary.

## Where this draft differs

Against the other two drafts in this directory, the substantive disagreements:

- **Ceremony removal outranks the handler wrapper.** Both other drafts open with
  a `withForgeLogging()`-style wrapper at P0. It is valuable (2.8 here), but
  `logger.info({}, "msg")`, numeric levels, and a private test helper are what
  make a developer stop using this package day to day. Fix the ten-minute
  experience first; it is also a fraction of the work.
- **Namespace Level Overrides (2.10) appear in neither.** Both read loguru's
  `enable`/`disable` as library-noise control and rate it low. On a cost-metered
  runtime it is the mechanism that makes production debug logging affordable at
  all, which makes it the most Forge-specific idea in this proposal.
- **`console.*` capture (3.12) appears in neither**, and it is the largest
  unaddressed customer-data leak path in a real app with dependencies.
- **Level names in records (1.3)** — the other drafts treat loguru's datetime and
  formatting items as documentation work. The concrete readability defect is
  `"level": 30`, and it is a one-line fix.
- **Lazy logging shape.** Prefer a thunk in the existing metadata position over
  new `debugLazy()`/`ifLevel()` methods: one method per level, and it reads as an
  ordinary log call.
- **Sampling is a non-goal, not a P2.** An absent record is ambiguous in a way
  that a voluminous one is not.
- **`Result` handling in the invocation wrapper.** Neither other draft notes that
  an app built on `@forge-ahead/errors` returns failures rather than throwing, so
  a catch-only wrapper silently logs `Err` as success.
