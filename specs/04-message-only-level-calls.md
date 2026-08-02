# 04 — Accept message-only calls on level methods

**What to build:** `logger.info("handled request")` type-checks and emits the same record as `logger.info({}, "handled request")`, removing the empty-object placeholder.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `logger.info("msg")` and `logger.info({ a: 1 }, "msg")` both type-check and emit equivalent records apart from metadata.
- [x] Object-first calls remain the documented and recommended shape.
- [x] A metadata object that already contains a `msg` key does not collide with the message argument.
- [x] All seven level methods (`fatal` through `trace`) support the message-only form.
