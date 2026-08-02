# 07 — Spike `AsyncLocalStorage` in a Forge runtime

**What to build:** A recorded decision (ADR or spike note) on whether `node:async_hooks`/`AsyncLocalStorage` works across Forge’s async boundaries, or whether ambient context must be implemented differently.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] A small spike function is deployed or exercised in a representative Forge runtime (`nodejs20.x`/`22.x`/`24.x`).
- [x] The spike verifies that an `AsyncLocalStorage` value set at the start of an invocation is still readable after at least one `await` and one nested async call.
- [x] Concurrent invocations are checked for isolation.
- [x] The outcome is written up as an ADR or spike note that gates the design of ambient log context.
