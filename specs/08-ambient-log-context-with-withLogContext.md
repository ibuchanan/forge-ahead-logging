# 08 — Add ambient log context with `withLogContext`

**What to build:** A scope like `withLogContext({ requestId }, () => { ... })` automatically merges bindings into every record emitted inside it, isolated across concurrent invocations.

**Blocked by:** 07 — Spike `AsyncLocalStorage` in a Forge runtime.

**Status:** ready-for-agent

- [x] `withLogContext(bindings, operation)` runs the operation and merges ambient bindings into every record emitted by any `ForgeLogger` inside the scope.
- [x] Explicit per-call metadata wins over ambient bindings on key collision; ambient context wins over base/`child()` bindings.
- [x] Ambient values are summarized and redacted before reaching the record.
- [x] Concurrent invocations do not observe each other’s context.
- [x] Context is empty outside any `withLogContext` scope and does not leak after a scope ends.
