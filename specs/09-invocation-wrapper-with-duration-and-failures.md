# 09 — Add an invocation wrapper that logs duration, outcome, and failures

**What to build:** A single wrapper around a Forge resolver/handler that logs completion with `durationMs` and outcome, correctly handles both thrown errors and `@forge-ahead/errors` `Result` values, and re-throws the original error.

**Blocked by:** 08 — Add ambient log context with `withLogContext`.

**Status:** ready-for-agent

- [x] A wrapper such as `logger.invocation(event, handler)` or `withForgeInvocationLogging(logger, event, handler)` is available.
- [x] Success and failure each emit exactly one completion record containing `durationMs` and `outcome`.
- [x] Thrown or rejected values are logged and then re-thrown with the same identity.
- [x] `Result` values from `@forge-ahead/errors` are classified correctly: `Err` is logged as failure, not success.
- [x] Entry logging is opt-in and, when enabled, respects the existing level and `includeEventShape` gates.
- [x] The handler body inherits the ambient log context from the wrapper.
