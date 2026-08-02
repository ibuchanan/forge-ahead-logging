# 14 — Add configuration helper and per-record dynamic enrichment

**What to build:** A small `configureForgeLogger()` surface for the default singleton and a `recordMetadata` callback for stable per-record fields (e.g. trace IDs), with documented precedence and redaction.

**Blocked by:** 02 — Export a ready-to-use default logger, 08 — Add ambient log context with `withLogContext`.

**Status:** implemented

- [x] `configureForgeLogger(options)` updates only the default singleton logger; custom `createForgeLogger()` instances are unaffected.
- [x] A `recordMetadata` option in `ForgeLoggerOptions` returns a small metadata object that is merged into every emitted record.
- [x] The callback output is summarized and redacted before emission.
- [x] The callback runs only when the record’s level is enabled.
- [x] Precedence is documented: explicit log metadata > ambient context > record metadata > base bindings.
- [x] Callback errors do not break the application call; the logger emits a minimal fallback record instead.
