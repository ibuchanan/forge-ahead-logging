# 06 — Add dynamic-level `logger.log(level, obj, message?)`

**What to build:** Code that computes severity at runtime can log through the existing seven levels without inventing custom levels.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `logger.log(level, metadata, message?)` is available on `ForgeLogger` and accepts every `ForgeLogLevel` except `silent`.
- [x] The call routes to the matching level method and applies the same redaction, summarization, and message-only rules.
- [x] Invalid or unknown levels are handled safely (no emission, documented fallback) and covered by a test.
- [x] `logger.log` does not allow custom severity levels outside the existing set.
