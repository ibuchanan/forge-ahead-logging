# 03 — Emit string level labels instead of numeric levels

**What to build:** Every log record shows `"level": "info"` instead of `"level": 30` while keeping the existing console-method routing unchanged.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Every emitted record carries a string level matching `ForgeLogLevel`.
- [ ] Console-method routing per level (`error`, `warn`, `info`, `debug`) is unchanged.
- [ ] The change is noted in CHANGELOG as output-shape-affecting for downstream parsers.
- [ ] Existing tests that assert on numeric levels are updated to string labels.
