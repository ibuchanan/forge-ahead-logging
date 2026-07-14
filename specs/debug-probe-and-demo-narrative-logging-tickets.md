# Debug Probe and Demo Narrative Logging Tickets

## 01 — Add the root Debug Probe API

**What to build:** Add Debug Probe support to the root logging API so callers
can wrap a value or application expression in a pass-through debug or trace log.
The probe should preserve sync return values, async fulfillment, and async
rejection behavior while emitting bounded, redacted, namespaced probe records
only when the selected probe level is enabled.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `logProbe()` is available from the root package and logs successful
  probes as `debugProbe: { label, value }`.
- [ ] `logger.probe()` is available on `ForgeLogger`, including child loggers,
  and emitted probe records preserve child bindings.
- [ ] Probes support only `debug` and `trace`, default to `debug`, and emit no
  records at the default `info` logger level.
- [ ] Sync probes return the original value, and async probes fulfill with the
  original resolved value.
- [ ] Rejected async probes and thrown probe thunks log at the requested probe
  level, use the approved Problem Details-style error shape inside
  `debugProbe.error`, and preserve rejection or thrown behavior for the caller.
- [ ] Probe values and probe metadata are bounded and redacted through the
  package summary behavior.
- [ ] Lazy probe-only metadata is not computed when the requested probe level is
  disabled, but the probed application expression still runs.
- [ ] Public documentation explains Debug Probe usage, level gating,
  pass-through behavior, and the difference from Demo Narrative Logging.

## 02 — Add Demo Narrative Logging as a demo subpath

**What to build:** Add Demo Narrative Logging as an explicit demo-oriented API
surface so example code can tell a flat, structured story through ordinary
logger records without putting demo-only helpers in the root production API.

**Blocked by:** 01 — Add the root Debug Probe API.

**Status:** ready-for-agent

- [ ] `createDemoNarrative(logger, { storyId })` is available from the demo
  subpath and is not exported from the root package.
- [ ] The package build and package exports expose the demo subpath as a public
  import path.
- [ ] `demo.step("message", metadata?)` emits through the supplied logger at
  `info`.
- [ ] Step records include `kind: "demoNarrativeStep"`, `demoOnly: true`,
  `storyId`, `stepNumber`, and the step message.
- [ ] Step numbers increment automatically for each narrative instance, and
  message-only steps are valid.
- [ ] Caller-provided step metadata is bounded and redacted through the package
  summary behavior.
- [ ] The first version does not add nested narratives, child narratives,
  per-step levels, lazy metadata, or special outcome lifecycle APIs.
- [ ] Public documentation explains that Demo Narrative Logging is for example
  code, uses structured logger records, and is intentionally isolated behind
  the demo subpath.
