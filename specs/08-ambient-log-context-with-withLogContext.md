# 08 — Add ambient log context with `withLogContext`

**What to build:** A scope like `withLogContext({ requestId }, () => { ... })` automatically merges bindings into every record emitted inside it, isolated across concurrent invocations.

**Blocked by:** 07 — Spike `AsyncLocalStorage` in a Forge runtime.

**Status:** ready-for-agent

- [ ] `withLogContext(bindings, operation)` runs the operation and merges ambient bindings into every record emitted by any `ForgeLogger` inside the scope.
- [ ] Explicit per-call metadata and `child()` bindings win over ambient bindings on key collision.
- [ ] Ambient values are summarized and redacted before reaching the record.
- [ ] Concurrent invocations do not observe each other’s context.
- [ ] Context is empty outside any `withLogContext` scope and does not leak after a scope ends.
