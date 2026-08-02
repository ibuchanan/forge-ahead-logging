# 18 — Add a `forge logs` NDJSON reader

**What to build:** A small CLI or library reader that turns `forge logs` output into filtered, projected, human-readable records aware of this package’s record kinds.

**Blocked by:** 03 — Emit string level labels instead of numeric levels.

**Status:** ready-for-agent

- [ ] A reader accepts NDJSON lines from `forge logs` and returns typed records.
- [ ] It can filter by level and project fields.
- [ ] It recognizes package-specific record kinds such as `debugProbe`, `demoNarrativeStep`, and the Forge invocation summary.
- [ ] The reader is exported from a dedicated subpath (e.g. `@forge-ahead/logging/reader` or a CLI package) and is not loaded in production app code.
- [ ] A README example shows `forge logs | <reader>`.
