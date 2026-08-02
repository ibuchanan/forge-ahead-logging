# 19 — Downstream integration guidance

**What to build:** Documented migration notes for the `forge-ahead` package and template/forge-prelint follow-ups for `LOG_LEVEL` wiring, without changing code in those other repos.

**Blocked by:** 02 — Export a ready-to-use default logger, 04 — Accept message-only calls on level methods, 05 — Accept lazy metadata thunks on all level methods, 11 — Add namespace-level overrides via `LOG_LEVEL`.

**Status:** ready-for-agent

- [ ] A migration note explains how existing `forge-ahead` consumers can switch to importing from `@forge-ahead/logging`.
- [ ] A plan for `forge-ahead` re-exports (if any) is documented with a clear deprecation/removal window.
- [ ] The `repo-init` template follow-up for `LOG_LEVEL` is specified: generated Forge apps declare `LOG_LEVEL` as a non-secret runtime variable with a default of `info`.
- [ ] The `forge-prelint` follow-up is specified: a rule detects projects using `@forge-ahead/logging` without managed `LOG_LEVEL` wiring.
- [ ] No source code in other repositories is modified; only specs and migration notes live here.
