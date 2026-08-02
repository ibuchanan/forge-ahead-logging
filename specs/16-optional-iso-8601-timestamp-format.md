# 16 — Add optional ISO-8601 timestamp format

**What to build:** An opt-in timestamp format change for human-readable local output, without changing the default epoch-ms shape.

**Blocked by:** None — can start immediately.

**Status:** implemented

- [x] An option enables ISO-8601 timestamps in emitted records.
- [x] The default timestamp remains pino epoch milliseconds so downstream parsers are unaffected.
- [x] The option works for both `createForgeLogger()` and the default logger.
- [x] CHANGELOG notes the output-shape impact when the option is enabled.
