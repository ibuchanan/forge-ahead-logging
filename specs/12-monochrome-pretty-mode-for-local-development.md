# 12 — Add monochrome pretty mode for local development

**What to build:** An opt-in pretty/print mode (e.g. `pretty: true` or env var) that emits human-readable lines locally while leaving the default Forge runtime output as JSON lines.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A `pretty` option (or env-driven equivalent) produces monochrome, human-readable output without ANSI color codes.
- [ ] Pretty mode is opt-in and never enabled by default in production or the Forge runtime.
- [ ] The default output remains NDJSON so `forge logs` and structured consumers are unaffected.
- [ ] If `pino-pretty` or a similar formatter is used, it is a development-only dependency, not a production dependency.
- [ ] README documents when and how to enable pretty mode for local runs.
