# 13 — Add optional `console.*` capture for third-party dependencies

**What to build:** An opt-in helper that redirects `console.log`/`console.error` from dependencies into the Forge logger so they pass through redaction and summarization, without recursion on the logger’s own output.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] An explicit opt-in function captures the original `console.*` references at install time and routes dependency output through the Forge logger.
- [ ] The logger’s own output does not recurse through the captured methods.
- [ ] Captured records are still summarized and redacted by the Forge logger.
- [ ] The feature is off by default; apps must call the installer explicitly.
- [ ] A test verifies that the capture does not break the logger’s own output.
