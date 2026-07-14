# Debug Probe and Demo Narrative Logging

## Debug Probe

Python has a library called icecream,
and node-icecream spawned from it.
The idea is to make it really easy
to wrap something in a log for debug reasons.

Without trying to copy the syntax closely,
I want this logging library to provide that convenience.

Resolved direction:

- Call this feature a Debug Probe.
- Export a standalone `logProbe()` helper from the root package.
- Add a matching `logger.probe()` method to `ForgeLogger`.
- Implement Debug Probe separately from Demo Narrative Logging, and implement
  it first.
- Probes are pass-through: they return the original value and preserve async
  fulfillment or rejection behavior.
- Probes only log at `debug` or `trace`.
- Probes accept an options object with `level?: "debug" | "trace"` and optional
  probe-only `metadata`.
- Probes emit one record after an async value settles, not before/after pairs.
- Probes require a caller-supplied label.
- Probes do not capture source file, line, function, or expression text
  automatically.
- Probes accept one value at a time; callers should pass an object when they
  want to inspect several values together.
- Probe payload fields are namespaced to avoid collisions with ordinary
  structured log fields.
- Successful probe records use `debugProbe: { label, value }`, where `value` is
  produced with `summarizeForLog()`.
- Probe metadata, when supplied, is summarized and nested under
  `debugProbe.metadata`.
- Failed async work or thrown probe thunks use
  `debugProbe: { label, error }`, where `error` follows the existing approved
  Problem Details-style error fields.
- Probe-only metadata may be lazy when the selected log level is disabled, but
  the probed application expression must still run.
- Rejected async work should use the existing Problem Details-style error
  logging shape rather than inventing a second error policy.
- Rejected async work still logs at the requested probe level, not at an
  operational error level.
- `logger.probe()` works on child loggers and carries their child bindings.
- Probe metadata is synchronous; async metadata is out of scope for the first
  version.

Test expectations:

- A sync probe returns the original value.
- An async probe fulfills with the original resolved value.
- An async probe rejection is logged at the requested probe level and rethrown.
- A probe does not emit at the default `info` level.
- Probe-only lazy metadata is not computed when the requested level is
  disabled.
- A probed application thunk still runs when the requested level is disabled.
- `logger.probe()` on a child logger preserves child bindings in emitted
  records.
- Probe values and metadata are bounded and redacted through `summarizeForLog()`.

## Demo Narrative Logging

Code can be hard to demo.
There's live coding,
but when the example is a static repo,
it's the log that can "tell the story".

On top of the production logging in this lib,
I want some additional tools
to make it easy to create a "story told in the logs"
and to make it clear that's just for example code purposes.

Resolved direction:

- Call this feature Demo Narrative Logging.
- Keep it behind a separate `@forge-ahead/logging/demo` subpath.
- Add the demo subpath to `package.json` exports as soon as the feature is
  implemented.
- Export `createDemoNarrative(logger, { storyId })`.
- Use `demo.step("message", metadata?)` for flat, ordered narrative steps.
- Require a caller-supplied `storyId`.
- Assign `stepNumber` automatically.
- Emit normal structured `ForgeLogger` records, not a second output format.
- Emit all demo narrative steps at `info`; do not support per-step levels in
  the first version.
- Include `demoOnly: true` on every demo narrative record.
- Summarize caller-provided step metadata with `summarizeForLog()`.
- Do not add a special outcome/lifecycle API in the first version; callers can
  log another step.
- Do not add child or nested narrative APIs in the first version; use distinct
  `storyId`s for separate narrative threads.
- Step metadata is plain data; lazy or async metadata is out of scope for the
  first version.

Test expectations:

- `createDemoNarrative(logger, { storyId })` emits `demo.step()` records through
  the supplied logger.
- Step records include `kind: "demoNarrativeStep"`, `demoOnly: true`, `storyId`,
  `stepNumber`, and the step message.
- Step numbers increment automatically.
- Message-only steps are valid.
- Caller metadata is bounded and redacted through `summarizeForLog()`.
- Demo narrative APIs are exported from `@forge-ahead/logging/demo`, not the
  root package.
