# 17 — Add message-formatting convenience for level methods

**What to build:** Extra message arguments pass through to Pino’s existing formatting (`%s`, `%j`) while keeping the object-first call shape.

**Blocked by:** 04 — Accept message-only calls on level methods.

**Status:** ready-for-agent

- [ ] `logger.info({ userId: "u-1" }, "Created user %s", "u-1")` is supported and passes extra arguments to Pino’s message formatting.
- [ ] The object-first call shape remains the documented default; formatting is a convenience, not the primary API.
- [ ] Custom brace-style interpolation is not introduced.
- [ ] All seven level methods support the extra message arguments.
