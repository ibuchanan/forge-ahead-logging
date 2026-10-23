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
2. Remove authorization-token previews from custom policies. Omit authorization fields or use `transform: "redact"` when presence matters.
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

5. Update consumers of `eventShape`: enabled diagnostics now contain only bounded, unnamed types and counts, not payload values or property names. `includeEventShape` and `FORGE_LOG_EVENT_SHAPE` still control inclusion at debug/trace-enabled thresholds; they cannot restore excluded fields. Audit custom context, result summaries, messages, and explicit projections separately. See [diagnostic migration](#migrate-from-value-bearing-diagnostics-breaking-change).

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

`logResult` and `logError` project their inputs into minimal failure metadata without changing the error model. Preserve the original error behavior after logging unless the surrounding API explicitly requires translation.

## Select additional error fields with a policy

Use the existing Object Summary Policy API to select reviewed diagnostic fields:

```ts
import { defineLogObjectSummaryPolicy, logError } from "@forge-ahead/logging";

const diagnosticPolicy = defineLogObjectSummaryPolicy({
  kind: "syncDiagnostic",
  fields: {
    errorCode: "code",
    retryable: "retryable",
    attempts: "attempts",
    causeCode: "cause.code",
  },
});

try {
  await runSync();
} catch (error) {
  logError(logger, error, {
    message: "sync failed",
    errorPolicy: diagnosticPolicy,
  });
  throw error;
}
```

Pass the same `errorPolicy` option to `logResult` / `logger.result`, `logError` / `logger.errorResult`, invocation wrappers, or probes. It replaces the entire automatic error projection, including automatic causes and aggregate members. Missing fields are omitted; `outcome: "failure"` remains. Include `code` or nested paths explicitly when needed; a policy selecting only `retryable` will not retain `errorCode`.

Review every selected value for necessity, access, and retention. Keep codes and types app-controlled; do not populate them with user input or identifying URLs. Do not restore raw messages, stacks, authorization data, or customer content merely because a policy makes that possible.

## Migrate from previous error logging (breaking change)

1. Update dashboards and assertions: domain failures now contain `errorCode` and `outcome`, not a message-derived `title` or arbitrary error properties. For example, `{ code: "CONFLICT", message: "customer text", retryable: true }` now logs `{ errorCode: "CONFLICT", outcome: "failure" }`.
2. Stop expecting Problem Details `title`, `detail`, `timestamp`, or `instance`. Only `type`, `status`, and `outcome` remain. The input error object and the downstream errors package are unchanged.
3. Stop expecting synthetic HTTP `500`/type values for plain exceptions or unknown thrown values. Use `errorName` and `outcome` for exceptions, or only `outcome` for unknown values. If an actual HTTP status is known, supply `logError`'s `status` option; it does not invent a status for a domain failure or override an existing Problem Details status. A replacement policy controls status inclusion itself.
4. Remove reliance on automatic stacks, even at debug/trace. Cause chains (at most three links) and aggregate members (at most three) retain shallow minimal projections, not messages or stacks. Use reviewed operational fields such as `causeCode` in the policy above instead of copying whole causes.
5. Audit existing `summarizeErr` callbacks. They still run after the selected projection and merge their return fields; they are not a replacement mechanism. Switch to `errorPolicy` to control inclusion. If a callback is still needed, return only reviewed metadata:

   ```ts
   logResult(logger, result, {
     errorPolicy: diagnosticPolicy,
     summarizeErr: () => ({ operation: "sync" }),
   });
   ```

6. Audit caller-supplied messages, labels, probe metadata, success summaries, logger bindings, and ambient context separately. These remain explicit application inputs and can reintroduce excluded data; raising the log threshold is not a privacy control.

## Migrate from value-bearing diagnostics (breaking change)

1. Update `eventShape`, `debugProbe.value`, `debugProbe.metadata`, and `consoleArgs` consumers to use [structural diagnostics](reference.md#structural-diagnostics). For example, `{ person: "customer text" }` now has shape `{ type: "object", keys: 1, values: [{ type: "string", length: 13 }] }`, not a truncated payload. Do not read old payload keys from these outputs.
2. Keep `includeEventShape` / `FORGE_LOG_EVENT_SHAPE` only where structural evidence is useful. They still require a debug/trace-enabled logger and never enable excluded invocation fields or error text. Count/length metadata still requires an operational need.
3. Remove reliance on `FORGE_LOG_LABELS`. To retain a reviewed optional label, select it in the application's policy and pass `includeLabels: true` explicitly to `summarizeObjectForLog`. Do not enable names or customer content globally. A field called `name` or `id` can describe either an app-controlled operation or a person; review the actual value source.
4. If a probe needs value-bearing operational evidence, provide a narrow policy instead of restoring the entire value. Keep evaluation outside any log-level check:

   ```ts
   const progressPolicy = defineLogObjectSummaryPolicy({
     kind: "syncProgress",
     fields: { processed: "processed", retryable: "retryable" },
   });
   const attemptPolicy = defineLogObjectSummaryPolicy({
     kind: "syncAttempt",
     fields: { attempts: "attempts" },
   });
   const result = await logger.probe("sync batch", () => syncBatch(), {
     valuePolicy: progressPolicy,
     metadata: () => ({ attempts, customer: customerData }),
     metadataPolicy: attemptPolicy,
   });
   ```

   Only the reviewed selections are emitted. `syncBatch()` still runs at info; lazy metadata and policy projections do not. Omit a policy to collect structural evidence instead. Use `errorPolicy` separately for reviewed failure evidence. If probe-only diagnostics throw, the probe record is dropped and the application outcome is preserved.
5. For console output requiring reviewed values, replace the call with a logger record built using `summarizeObjectForLog`. Console capture has no raw-argument mode. Uninstall it when no longer needed.
6. Audit raw text separately: probe labels, logger messages, and a captured console call's leading string remain verbatim. Keep these fixed and app-controlled. `summarizeForLog`, explicit policy selections, callbacks, bindings, ambient context, and the demo API remain value-bearing application escape hatches; bounding or redaction does not make arbitrary input private.

## Summarize a rich object before logging it

Use `summarizeForLog` only for values already reviewed for collection. It bounds values and redacts common secret-shaped fields; it still copies other values and property names:

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

## Migrate and review Object Summary Policies (breaking change)

1. Define application policies with `defineLogObjectSummaryPolicy` at module initialization or configuration startup, before handling requests. Pass existing policy objects through the helper too; direct literals passed only to `summarizeObjectForLog` are not validated. Keep definitions unchanged after validation.
2. Resolve definition errors before enabling logging. Supply a nonblank `kind`, valid field maps, nonempty source paths/segments, and one of the documented transforms. Replace previously accepted identity selections of recognized secret paths with omission, `redact`, or justified `omittedShape` metadata. Renaming the output alias does not bypass source-path validation:

   ```ts
   const credentialPresencePolicy = defineLogObjectSummaryPolicy({
     kind: "requestCredentialPresence",
     fields: {
       credential: { path: "headers.Authorization", transform: "redact" },
     },
   });
   ```

3. Add optional `review` metadata when documenting a policy's purpose and identifier decision. For an operational-only projection, explicitly exclude identifiers:

   ```ts
   const retryPolicy = defineLogObjectSummaryPolicy({
     kind: "deployment",
     fields: { state: "state", attempt: "attempt" },
     review: {
       purpose: "Diagnose deployment retries",
       indirectIdentifiers: { treatment: "excluded" },
     },
   });
   logger.info(summarizeObjectForLog(deployment, retryPolicy), "deployment retry");
   ```

   Only `kind`, `state`, and `attempt` are selected. The input's identifiers, customer content, and policy metadata are not implicitly collected.
4. If a concrete troubleshooting need requires an indirect identifier, select it explicitly and document retention justification:

   ```ts
   const correlationPolicy = defineLogObjectSummaryPolicy({
     kind: "deployment",
     fields: { state: "state", deploymentId: "id" },
     review: {
       purpose: "Correlate failed deployment attempts",
       indirectIdentifiers: {
         treatment: "retained",
         justification: "Deployment ID is needed to join retry records",
       },
     },
   });
   logger.info(
     summarizeObjectForLog(deployment, correlationPolicy),
     "deployment retry correlation",
   );
   ```

5. Review actual value sources, optional labels, access, and retention separately. `excluded` is a review assertion, not an automatic classifier or deletion rule. `retained` does not select any field by itself or authorize unrelated fields, labels, or content. Purpose annotations are not legal approval, consent, or anonymization, and cannot enforce downstream retention. Existing safe policies may omit `review`; built-in summary fields, bounds, and explicit label enablement are unchanged. See the [validation contract and limits](reference.md#definelogobjectsummarypolicypolicy).

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
