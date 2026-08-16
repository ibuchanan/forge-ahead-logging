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
Error logging normalizes thrown values,
bounds stacks and causes,
and keeps the original control flow available to the caller.

This distinction prevents a common observability mistake:
treating every non-success outcome as an infrastructure crash,
or treating every thrown value as safe to stringify wholesale.

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
