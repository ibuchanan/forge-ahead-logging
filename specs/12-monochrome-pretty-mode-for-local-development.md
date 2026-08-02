# 12 — Add monochrome pretty mode for local development

**What to build:** An opt-in pretty/print mode (e.g. `pretty: true` or env var) that emits human-readable lines locally while leaving the default Forge runtime output as JSON lines.

**Blocked by:** None — can start immediately.

**Status:** implemented

- [x] A `pretty` option (or env-driven equivalent) produces monochrome, human-readable output without ANSI color codes.
- [x] Pretty mode is opt-in and never enabled by default in production or the Forge runtime.
- [x] The default output remains NDJSON so `forge logs` and structured consumers are unaffected.
- [x] Pretty formatting is implemented without `pino-pretty`, so there is no production dependency on a formatter.
- [x] README documents when and how to enable pretty mode for local runs.
