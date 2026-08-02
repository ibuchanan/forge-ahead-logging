# 02 — Export a ready-to-use default logger

**What to build:** `import { log } from "@forge-ahead/logging"` (or equivalent) works without calling `createForgeLogger()`, while still respecting `LOG_LEVEL` and `NODE_ENV`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A default logger is exported from the root package and is created on first use, not at import time.
- [ ] The default logger emits records indistinguishable from `createForgeLogger()` with no options.
- [ ] `LOG_LEVEL` resolution is not frozen before the consuming environment can read Forge variables.
- [ ] `createForgeLogger()` remains the path for named loggers, custom redaction, and injected `env`.
- [ ] README shows the default logger as the simplest getting-started path.
