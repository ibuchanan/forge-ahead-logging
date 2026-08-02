# Feature Suggestions for `@forge-ahead/logging` Developer Experience

## Status

Draft — analysis and proposals inspired by the Loguru Python logging library. These are not a roadmap; they are a prioritized set of candidate improvements to make the package useful for any Forge developer.

## Context

`@forge-ahead/logging` is an opinionated, Forge-safe wrapper around `pino`. It already provides good runtime behavior: structured JSON output, `LOG_LEVEL` resolution, default redaction, Object Summary Policies, bounded `summarizeForLog`, Forge invocation logging, Result/Error logging, Debug Probes, and Demo Narrative Logging.

Compared with Loguru’s developer experience, several common friction points could be reduced while keeping the package safe for Forge:

- A developer must always construct a logger before writing the first log.
- Errors that escape from callbacks or async handlers are not automatically logged.
- Debug metadata is always built even when the level is disabled.
- Local output is always JSON lines, which is hard to read during `forge tunnel` or unit tests.
- There is no way to temporarily silence a logger or carry request context across an async scope.

## What we should *not* port from Loguru

| Loguru feature | Why skip or deprioritize |
|---|---|
| **Colors** | The Forge developer console and CLI parse logs structurally; ANSI colors add noise. |
| **File rotation / retention / compression** | Forge logs are captured by intercepting `console.*`, not by tailing files. File sinks would not work in the runtime. |
| **Custom log levels** | pino/Forge standard levels (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) are sufficient. Custom levels would break downstream tooling. |
| **Async/thread-safe/multiprocess-safe sinks** | Node handles this via the event loop; pino already writes efficiently. Not a DX gap. |
| **Log parser / notifier integration** | Out of scope for a runtime logging package. |
| **Better datetime formatting** | pino emits timestamps; the Forge log viewer handles formatting. |

## Proposed improvements

### 1. Export a ready-to-use default logger

**Loguru inspiration:** *“Ready to use out of the box without boilerplate”*  
**Priority:** High  
**Effort:** Low

**Current state:** every caller must run `createForgeLogger({ name: "..." })` first.

**Proposed API:**

```ts
import { logger } from "@forge-ahead/logging";

logger.info({ userId: "u-123" }, "handling request");
```

**Design notes:**

- Export a singleton created at import time with `createForgeLogger()`.
- Keep `createForgeLogger(options)` for apps that need customization.
- The default instance should still respect `LOG_LEVEL` and `NODE_ENV` exactly like a custom instance.

---

### 2. Add a `catch` wrapper for functions and promises

**Loguru inspiration:** *“Exceptions catching within threads or main”*  
**Priority:** High  
**Effort:** Low

**Current state:** developers must manually wrap code in `try/catch` and then call `logError(logger, thrown)`.

**Proposed API:**

```ts
const safe = logger.catch(riskyFunction, { message: "riskyFunction failed" });

// safe() throws the same error, but a structured record is logged first
await safe();
```

**Design notes:**

- The wrapper must return the original value and rethrow the same error.
- It should work for both synchronous and asynchronous functions.
- Options should allow `level`, `message`, `status`, and whether to re-raise (default `true`).
- The error should be normalized through the existing `@forge-ahead/errors` path.

---

### 3. Accept lazy metadata thunks

**Loguru inspiration:** *“Lazy evaluation of expensive functions”*  
**Priority:** High  
**Effort:** Low

**Current state:** `logger.debug({}, ...)` is a no-op when the level is disabled, but the metadata object is still constructed. `logProbe` already supports lazy metadata, but only for probes.

**Proposed API:**

```ts
logger.debug(
  () => ({ expensive: buildDebugSnapshot() }),
  "snapshot",
);
```

**Design notes:**

- If the effective level is disabled, the thunk is never called.
- If the level is enabled, the thunk is called and the result is summarized and redacted exactly like a normal object.
- The thunk form must still be object-first: the function returns the metadata object.

---

### 4. Monochrome pretty mode for local development

**Loguru inspiration:** *“Pretty logging with colors”* — adapted because Forge logs don’t need colors.  
**Priority:** High  
**Effort:** Medium

**Current state:** output is always JSON lines, which is ideal for `forge logs` but noisy when running locally.

**Proposed API:**

```ts
const logger = createForgeLogger({ pretty: true });

// or via environment
// FORGE_LOG_PRETTY=1 forge run
```

**Design notes:**

- Pretty mode should be opt-in and only apply in local/dev contexts.
- Production and the Forge runtime should continue to receive JSON lines.
- Output should be monochrome, with a readable format such as:
  `2026-08-01T12:34:56.789Z INFO handling request userId=u-123`.
- Avoid making `pino-pretty` a hard production dependency if it is not needed at runtime.

---

### 5. Per-logger `disable()` / `enable()`

**Loguru inspiration:** *“Suitable for scripts and libraries”*  
**Priority:** Medium  
**Effort:** Low

**Current state:** there is no way to make a logger silent without changing `LOG_LEVEL`.

**Proposed API:**

```ts
logger.disable(); // all level methods become no-ops
logger.enable();  // normal behavior restored
```

**Design notes:**

- This is a runtime toggle, not a level change.
- It makes the package safe for shared libraries: a library can log normally, and the consuming app can silence it.
- It should also be possible to check whether a logger is enabled via `logger.isEnabled()`.

---

### 6. Async context scope (`contextualize`)

**Loguru inspiration:** *“Structured logging as needed” / `contextualize()`*  
**Priority:** Medium  
**Effort:** Medium

**Current state:** context is carried only through explicit `child()` loggers, which must be passed down the call stack.

**Proposed API:**

```ts
const logger = createForgeLogger({ asyncContext: true });

await logger.runWithContext({ requestId: "req-1" }, async () => {
  logger.info({ userId: "u-1" }, "in the same request");
  await doWork();
  logger.info({ done: true }, "request finished");
});
```

**Design notes:**

- Use Node’s `AsyncLocalStorage` (available in Node 22).
- Context is merged with any explicit `child()` bindings.
- This should be opt-in to avoid complexity for simple scripts.

---

### 7. Better exception detail: cause chains and aggregate errors

**Loguru inspiration:** *“Fully descriptive exceptions”*  
**Priority:** Medium  
**Effort:** Low

**Current state:** `logError` includes `errorName` and a stack trace when debug is enabled, but it does not walk `error.cause` or handle `AggregateError`.

**Proposed API:** no new public API; improve the existing error metadata builder.

**Design notes:**

- Serialize `error.cause` recursively, with a bounded depth.
- Serialize `AggregateError.errors` as a bounded array of normalized errors.
- Keep the existing debug/trace gating for stack traces.

---

### 8. Message formatting convenience

**Loguru inspiration:** *“Modern string formatting using braces style”*  
**Priority:** Low  
**Effort:** Low

**Current state:** messages are plain strings; pino-style `%s` formatting is supported under the hood but not emphasized.

**Proposed API:**

```ts
logger.info({ userId: "u-1" }, "Created user %s", "u-1");
```

**Design notes:**

- Keep the object-first call shape.
- Pass extra message arguments through to pino’s existing formatting.
- Do not introduce custom brace-style interpolation unless there is a strong reason; pino’s `%s`/`%j` is enough.

---

### 9. Configuration helper

**Loguru inspiration:** *“Suitable for scripts and libraries” / `configure()`*  
**Priority:** Low  
**Effort:** Low

**Current state:** `createForgeLogger(options)` covers most configuration, but test harnesses and CLI tools sometimes want to reset the global default.

**Proposed API:**

```ts
configureForgeLogger({
  level: "debug",
  redact: ["myApp.internalToken"],
  pretty: true,
});
```

**Design notes:**

- Only affects the default singleton logger.
- Custom `createForgeLogger()` instances are unaffected.
- Useful for test setup, not for normal app code.

---

## Suggested implementation order

**Phase 1 — “Drop the boilerplate”**

1. Default singleton logger export
2. `logger.catch` / `catchError` wrapper
3. Lazy metadata thunks in level methods

**Phase 2 — “Pleasant local development”**

4. Monochrome pretty mode
5. Per-logger `disable()` / `enable()`

**Phase 3 — “Production context”**

6. Async context scope (`contextualize`)
7. Cause-chain / aggregate error serialization

**Phase 4 — “Nice to haves”**

8. Message formatting convenience
9. Configuration helper

---

## Open questions

- Should the default singleton logger have a default name (e.g., `forge-ahead`) or remain unnamed?
- Should pretty mode auto-enable under `NODE_ENV=development`, or should it require an explicit `FORGE_LOG_PRETTY` flag?
- Should `catch` support a block-style `tryCatch` helper in addition to a function wrapper?
- Should async context support be a separate package export or a `createForgeLogger` option?
