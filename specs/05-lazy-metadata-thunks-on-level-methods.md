# 05 — Accept lazy metadata thunks on all level methods

**What to build:** Expensive diagnostics are only computed when the level is enabled, using the same object-first form as normal logging.

**Blocked by:** 04 — Accept message-only calls on level methods.

**Status:** ready-for-agent

- [x] A metadata thunk in the metadata position, e.g. `logger.debug(() => ({ expensive: compute() }), "msg")`, is called only when the effective level is enabled.
- [x] When enabled, the thunk result is summarized and redacted exactly like a normal metadata object.
- [x] A public `isLevelEnabled(level)` method is available on `ForgeLogger` and agrees with resolved `LOG_LEVEL` for all seven levels.
- [x] A thunk that throws is handled by a documented policy (swallowed or propagated) and covered by a test.
