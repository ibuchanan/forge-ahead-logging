# Explanation: Why Forge logging needs structure, bounds, and context

A Forge app does not run as a continuously available server
that an operator can inspect at will.
Backend functions execute on demand in a managed, sandboxed environment.
That changes what a useful log record must do:
it has to carry enough context to identify the work,
remain safe when payloads are rich,
and stay small enough to survive platform logging limits.

## Forge gives the application an execution boundary, not an observability model

Forge supplies the execution model and captures backend output.
It also supplies platform metadata such as invocation identity.
Those facts are valuable,
but they do not explain the application’s operation:
which domain action ran,
which customer or request it belonged to,
or whether a returned value represented a business failure.

The logging package fills that gap at the application boundary.
`withForgeInvocationLogging` identifies lifecycle events,
`withLogContext` carries stable bindings,
and `logResult` and `logError` translate application outcomes into records
that can be searched and compared.

This separation matters.
Platform metadata should remain platform metadata;
application code should add application meaning
rather than re-creating the platform’s identifiers
or assuming that a frontend console record is equivalent to a backend record.

## Structured records are a cost control

A free-form message is easy to write but expensive to operate.
Once an application has multiple resolvers, triggers, and scheduled functions, operators
need stable fields for filtering and aggregation.
A structured record makes `operation`, `requestId`, `status`, and `error.code` addressable data
instead of text that must be parsed later.

Structure also discourages accidental verbosity.
The package’s APIs make the intended record shape explicit:
invocation records, result records, error records, and summaries.
This is an opinionated constraint,
but it is useful in a serverless platform
where every invocation has bounded logging capacity.

## Bounds are a safety property, not merely a formatting choice

Forge logging has limits on lines and bytes per invocation.
Rich Atlassian payloads can contain
nested objects, arrays, descriptions, account information, tokens, and error causes.
Logging such a payload unchanged creates three risks at once:
1. the record may exceed the platform’s available log budget;
2. sensitive values may be copied into operational systems;
3. the useful signal may be buried inside irrelevant payload detail.

`summarizeForLog` addresses size and shape.
Object Summary Policies address repeatability by allowing a known projection of a domain object.
Default redaction is only a backstop:
it catches common secret-shaped paths,
but it cannot know every sensitive field in every product payload.
The application still owns the decision about what is safe to log.

Atlassian’s [Forge logging guidelines](https://developer.atlassian.com/platform/forge/logging-guidelines/)
explain the privacy considerations behind that decision:
collect only what is needed for troubleshooting, avoid personal data and authorization data,
and treat indirect identifiers such as account and cloud IDs with caution.
Bounding a value does not make it safe to collect.

## Verbosity is not permission to collect values

A debug threshold answers how much diagnostic activity to emit, not whether a person's name, a token, or customer text is necessary. Environment toggles are operational switches, not a review of each selected field. Property names can themselves be customer-controlled data, so retaining them while hiding leaves is not a generally safe structural representation.

Automatic structural diagnostics therefore retain bounded, unnamed types and counts rather than leaf values or arbitrary property names. The same distinction applies to event shapes, successful probe values, probe metadata, and captured console arguments. Invocation and error projections remain independently minimized. A label environment toggle cannot authorize value collection: optional policy labels need explicit inclusion at the application call site.

When values are necessary, an application Object Summary Policy makes that selection visible in code review. This is a reuse of the existing projection boundary, not a second privacy-policy framework. The source and purpose of the value matter more than a generic field name such as `name` or `id`. Counts and lengths can also reveal information, so structural does not mean free of all privacy considerations.

Raw text is a deliberate remaining boundary. Logger messages, probe labels, and the leading string in console capture are not content-classified or sanitized. Nor are generic value summaries or explicit application projections automatically private. No production bypass or assumption about harmless local data is needed to raise verbosity without restoring excluded automatic fields.

## Context is an ergonomic layer, not authority

Passing `requestId` and operation metadata through every helper is explicit but noisy.
Ambient context provides a practical compromise:
establish bindings at the invocation boundary
and let nested logging code enrich records
without changing every function signature.

That convenience must not be confused with security.
Context values can be missing, malformed, or supplied by an untrusted caller.
Authorization should use verified Forge context and product permissions,
not a value retrieved from `getLogContext()`.

The package also keeps the storage mechanism behind `withLogContext`.
That leaves room to change the implementation
if a particular Forge execution boundary does not preserve
the same asynchronous context behavior as local Node.js.

## Result logging should reflect domain outcomes

Not every failed operation throws an exception.
A typed result can represent a business failure
while the function itself completes normally.
Conversely, an exception may have a useful cause chain
but no safe, stable public message.

`logResult` and `logError` therefore serve different but related purposes.
Result logging preserves the application’s success/failure model,
including the project’s domain error shape.
Error logging projects thrown values into minimal operational metadata,
bounds cause and aggregate summaries, omits raw stacks,
and keeps the original control flow available to the caller.

This distinction prevents a common observability mistake:
treating every non-success outcome as an infrastructure crash,
or treating every thrown value as safe to stringify wholesale.

## Automatic error logging is allow-list based

Error logging operates on an allow-list principle:
only controlled, application-defined fields are collected automatically.
Error codes, Problem Details types and statuses, and Error names
provide operational meaning without copying the whole failure.
Their values must be controlled by the application; their field names do not prove they are non-sensitive.
Messages, identifying instance URLs, stacks, and arbitrary properties are excluded by default.

Why?
An error message, path, URL, instance identifier, or property value
might contain user-generated content, personal data, authentication tokens, or secrets.
A stable Error name (`Error`, `SyntaxError`, `ReferenceError`) distinguishes failure classes;
but custom `name` values, like codes and type URIs, still need an application contract.
The `message` property is often populated from inputs and is not collected automatically.

A domain error that uses controlled `code` values (e.g., `"CONFLICT"`, `"RATE_LIMIT"`)
does not prove that the same error's `message` or arbitrary properties are safe.
The code is an application contract; the message and properties are not.

When troubleshooting requires additional fields,
applications use an Object Summary Policy to select them explicitly.
The policy is an application decision, documented in code, not a claim that arbitrary strings are non-sensitive.
This keeps the default case safe and makes deliberate exceptions visible to reviewers.

The same allow-list approach applies to nested causes (up to 3 levels)
and AggregateError members (up to 3):
each uses the same controlled projections,
and the policy does not restore excluded defaults.

## Why demo logging is a separate API

A teaching demo often benefits from a narrated sequence:
“load account,” “summarize licenses,” “finish.”
Production logs usually need the opposite qualities:
stable operational fields, low noise, and no reader-directed prose.

`createDemoNarrative` uses the same structured logger
but marks each record as demo-only, assigns a story identity, and numbers the steps.
Keeping it behind `@forge-ahead/logging/demo` makes
the distinction visible in imports and code review.
The separation protects the production root API from becoming a home for example-oriented behavior
while preserving a useful path for documentation and demonstrations.

## Why Forge configuration belongs outside code

`LOG_LEVEL` changes operational verbosity without requiring a source change.
Forge stores variables separately per environment,
and a changed value is not active in a deployed environment
until the app is redeployed there.
That makes configuration explicit and environment-specific.

The variable is not a secret.
Encrypting it would obscure a normal operational setting
without adding meaningful protection.
Secrets should use Forge’s encrypted variable path;
a logging threshold should remain inspectable and easy to manage.

## The practical design rule

Log the smallest record that lets an operator answer the next question:
- Which invocation was this?
- What operation was attempted?
- What stable domain identity was involved?
- Did the operation succeed, return a domain failure, or throw?
- What bounded evidence distinguishes the likely causes?

That is the design center of this package: structured enough to operate, bounded enough to be safe, and contextual enough to explain a serverless invocation without reproducing the entire payload.

## Further reading

- [Tutorial](tutorial.md)
- [How-to guides](how-to.md)
- [Reference](reference.md)
- [Forge debugging and logging](https://developer.atlassian.com/platform/forge/debugging)
- [Forge environments and versions](https://developer.atlassian.com/platform/forge/environments-and-versions)
