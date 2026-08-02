# 16 — Add optional ISO-8601 timestamp format

**What to build:** An opt-in timestamp format change for human-readable local output, without changing the default epoch-ms shape.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] An option enables ISO-8601 timestamps in emitted records.
- [ ] The default timestamp remains pino epoch milliseconds so downstream parsers are unaffected.
- [ ] The option works for both `createForgeLogger()` and the default logger.
- [ ] CHANGELOG notes the output-shape impact when the option is enabled.
