# 15 — Add narrow env-var diagnostic toggles

**What to build:** Env-driven flags (e.g. `FORGE_LOG_LABELS`) that can widen diagnostic metadata only when the level already allows it, never bypassing the level gate.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A documented set of env-var toggles enables bounded diagnostics such as label inclusion or `includeEventShape`.
- [ ] Each toggle is default-off and only takes effect when the current log level would already emit the record.
- [ ] An env var cannot widen what a level already refuses to emit.
- [ ] `resolveLogLevel()` continues to report the source and invalid values without emitting log records.
- [ ] README explains the intended short-lived debugging workflow.
