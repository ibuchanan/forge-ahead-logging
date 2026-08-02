# 11 — Add namespace-level overrides via `LOG_LEVEL`

**What to build:** `LOG_LEVEL="info,my-lib=debug"` turns debug logging on only for the named logger and its children, so production debugging is scoped and cost-controlled.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `resolveLogLevel()` accepts per-name overrides in `LOG_LEVEL` and reports them in `ResolvedForgeLogLevel`.
- [x] A plain `LOG_LEVEL=debug` behaves exactly as today.
- [x] An override applies to the named logger and loggers created through `child()` from it.
- [x] An invalid segment is reported via `invalidValue` rather than causing a fatal error.
- [x] The `repo-init` and `forge-prelint` follow-ups documented in `downstream-integration-work.md` are updated if the accepted `LOG_LEVEL` format changes.
