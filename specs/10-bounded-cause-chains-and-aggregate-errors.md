# 10 — Improve error metadata with bounded cause chains and aggregate errors

**What to build:** `logError()` and `logResult()` error paths emit bounded `cause` chains and `AggregateError` summaries, with a capped stack-frame count and a visible `[N frames omitted]` marker.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] A three-deep `error.cause` chain logs three bounded links, each containing approved Problem Details fields.
- [x] A cyclic `error.cause` chain terminates instead of looping forever.
- [x] `AggregateError.errors` is summarized as a bounded array of normalized error records.
- [x] Emitted stack traces have a documented upper frame count and include a `[N frames omitted]` marker when truncated.
- [x] The existing debug/trace gate for stacks is preserved; no local-variable diagnostics are captured.
