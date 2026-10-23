# How-to guides: Operate logging in a Forge app

These recipes assume you already know TypeScript and Forge development. Each section addresses one operational goal without introducing the logging model from first principles.

## Configure `LOG_LEVEL` per Forge environment

Set the variable in the target environment:

```sh
forge variables set --environment development LOG_LEVEL info
forge variables set --environment staging LOG_LEVEL warn
forge variables set --environment production LOG_LEVEL error
```

Redeploy the same environment after changing the variable:

```sh
forge deploy --non-interactive -e development
```

The value is read from `process.env.LOG_LEVEL`. It is a non-secret configuration value; do not use the encrypted setter merely because it is an environment variable.

## Add invocation-scoped fields

Use `withLogContext` at the boundary of a resolver, trigger, or other backend operation:

```ts
import { withLogContext } from "@forge-ahead/logging";

return withLogContext(
  { requestId, operation: "sync" },
  async () => runSync(),
);
```

Read the current context when an adapter needs to enrich a record explicitly:

```ts
import { getLogContext } from "@forge-ahead/logging";

const context = getLogContext();
```

Keep context values small and non-sensitive. Ambient context is a convenience for log enrichment, not an authorization mechanism.

## Log Forge invocation lifecycle events

For a single event object, use `logForgeInvocation`:

```ts
import { logForgeInvocation } from "@forge-ahead/logging";

logForgeInvocation(logger, event, "received event");
```

To log start, success, and failure around an operation, use `withForgeInvocationLogging`:

```ts
return withForgeInvocationLogging(
  logger,
  event,
  () => processEvent(event),
  { message: "processEvent completed" },
);
```

Use the wrapper at the boundary where the event enters your application. Avoid wrapping every helper; nested wrappers create repetitive records and consume Forge’s per-invocation log budget.

## Migrate from the previous invocation summary

1. Update consumers, dashboards, and assertions that expected `path`, `cloudId`, `queryParameters`, or `contextToken`. Those fields are now absent, not replaced with previews or placeholders. For example, `{ method: "POST", path: "/private", context: { cloudId: "customer" }, contextToken: "secret" }` now produces `{ kind: "forgeEvent", method: "POST" }`.
2. Remove authorization-token previews from custom policies. Omit authorization fields or use `transform: "redact"` when presence matters. Do not use `tokenPreview` for authorization data; it remains a value-revealing compatibility transform, not a safe migration option.
3. If routing is needed, supply an app-controlled route template explicitly. Do not derive it from an arbitrary request path or URL:

   ```ts
   const routeTemplate = "/widgets/:widgetId"; // Fixed by the handler, not the request.
   const summary = summarizeForgeInvocation(event);
   logger.info({ ...summary, routeTemplate }, "received widget request");
   ```

4. Only if a documented troubleshooting need requires an indirect identifier, deliberately select that field through an application Object Summary Policy. Review its necessity, access, and retention before enabling it:

   ```ts
   const correlationPolicy = defineLogObjectSummaryPolicy({
     kind: "supportCorrelation",
     fields: { cloudId: "context.cloudId" },
   });
   const correlation = summarizeObjectForLog(event, correlationPolicy);
   const scopedLogger = logger.child({ correlation });

   return withForgeInvocationLogging(
     scopedLogger,
     event,
     () => processEvent(event),
     { includeEventShape: false },
   );
   ```

   This is an explicit application decision, not a claim that arbitrary policies or identifiers are safe. The built-in summary still omits the identifier.

5. Leave value-bearing event-shape diagnostics disabled for sensitive payloads. Set `includeEventShape: false` for invocation logging and lifecycle entry logging if necessary; remove `FORGE_LOG_EVENT_SHAPE=true`. Raising `LOG_LEVEL` alone does not change the built-in summary, but the existing opt-in diagnostics can still copy payload values. Audit custom context, result summaries, messages, and metadata separately.

## Log results and errors consistently

For a result value:

```ts
logResult(logger, result, { message: "sync result" });
```

For an exception:

```ts
try {
  await runSync();
} catch (error) {
  logError(logger, error, { message: "sync failed" });
  throw error;
}
```

`logResult` and `logError` normalize their inputs into bounded metadata. Preserve the original error behavior after logging unless the surrounding API explicitly requires translation.

## Summarize a rich object before logging it

Use `summarizeForLog` for general values:

```ts
logger.debug({ payload: summarizeForLog(payload) }, "payload summary");
```

Use `defineLogObjectSummaryPolicy` and `summarizeObjectForLog` when a domain object needs a stable allow-list:

```ts
const policy = defineLogObjectSummaryPolicy({
  kind: "syncOperation",
  fields: {
    status: "status",
    attemptCount: "attemptCount",
    body: { path: "body", transform: "omittedShape" },
  },
});

logger.info(
  { operation: summarizeObjectForLog(operation, policy) },
  "operation summary",
);
```

Prefer an allow-list policy for recurring records. Do not treat the default redaction backstop as permission to log arbitrary payloads.

## Capture third-party console output temporarily

Install capture around a dependency or migration path:

```ts
const uninstall = installConsoleCapture(logger);
try {
  await thirdPartyOperation();
} finally {
  uninstall();
}
```

Always uninstall the capture. Do not leave global console interception installed for the lifetime of a shared module unless that behavior is deliberate and tested.

## Enable pretty output locally

Create a local logger with pretty output when human-readable development output is useful:

```ts
const logger = createForgeLogger({
  pretty: true,
  timestamp: "iso",
});
```

Keep production output structured. Pretty mode is for local readability and should not be used as a substitute for stable fields.

## Diagnose a missing log record

Check the following in order:

1. Confirm the code path runs in a backend function, not only in frontend browser code.
2. Confirm the app was deployed after the code or variable change.
3. Confirm `LOG_LEVEL` is not filtering the record.
4. Run `forge logs` against the same environment that is installed on the site.
5. Use `--verbose --grouped` to inspect metadata and invocation grouping.
6. Check whether the invocation exceeded Forge log-line or log-size limits.

## Further reading

- [Tutorial](tutorial.md)
- [Reference](reference.md)
- [Explanation](explanation.md)
- [Forge environment configuration](https://developer.atlassian.com/platform/forge/environments-and-versions)
- [Forge debugging](https://developer.atlassian.com/platform/forge/debugging)
