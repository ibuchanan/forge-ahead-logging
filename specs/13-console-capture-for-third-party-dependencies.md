# 13 — Add optional `console.*` capture for third-party dependencies

**What to build:** An opt-in helper that redirects `console.log`/`console.error` from dependencies into the Forge logger so they pass through redaction and summarization, without recursion on the logger’s own output.

**Blocked by:** None — can start immediately.

**Status:** implemented

- [x] An explicit opt-in function captures the original `console.*` references at install time and routes dependency output through the Forge logger.
- [x] The logger’s own output does not recurse through the captured methods.
- [x] Captured records are still summarized and redacted by the Forge logger.
- [x] The feature is off by default; apps must call the installer explicitly.
- [x] A test verifies that the capture does not break the logger’s own output.
