# 15 — Add narrow env-var diagnostic toggles

**What to build:** Env-driven flags (e.g. `FORGE_LOG_LABELS`) that can widen diagnostic metadata only when the level already allows it, never bypassing the level gate.

**Blocked by:** None — can start immediately.

**Status:** implemented

- [x] `FORGE_LOG_LABELS` and `FORGE_LOG_EVENT_SHAPE` enable bounded diagnostics for label inclusion and invocation event shape.
- [x] Each toggle is default-off and only takes effect when the current log level already allows the record.
- [x] `FORGE_LOG_EVENT_SHAPE` cannot bypass the debug/trace gate; it only includes the event shape when the logger's level is verbose.
- [x] `resolveLogLevel()` continues to report the level source and invalid values without emitting log records.
- [x] README explains the intended short-lived debugging workflow.
