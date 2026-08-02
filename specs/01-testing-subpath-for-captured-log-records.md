# 01 — Publish a supported testing subpath for captured log records

**What to build:** Consumers can import `@forge-ahead/logging/testing` to create a logger whose records are captured through the real redaction and summary pipeline, so they can assert their own payloads are redacted without re-writing the private test helper.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `@forge-ahead/logging/testing` exports a public `createCapturingLogger(options?)` that returns `{ logger, records }`.
- [x] Captured records pass through the same default redaction, summary, and level-gating logic as a production logger.
- [x] A consumer can write a test that asserts a secret-shaped key is redacted using only public exports.
- [x] The testing subpath is not exported from the root package entry point.
- [x] Existing private test helpers are migrated to the public implementation or removed.
