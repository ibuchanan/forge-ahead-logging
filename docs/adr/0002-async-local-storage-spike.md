# Ambient log context: AsyncLocalStorage assumption

## Status

Spike complete locally. Pending validation in a real Forge runtime.

## Context

Ticket 08 proposes adding ambient log context via `withLogContext(bindings, operation)`
so that invocation-scoped bindings (for example `requestId`, `cloudId`, `accountId`)
automatically attach to every log record emitted inside a scope without being passed
through every application signature.

The natural Node.js mechanism for this is `AsyncLocalStorage` from `node:async_hooks`.
It lets a callback run inside an async context store, and that store remains readable
after `await` and through nested async calls as long as the platform preserves the
async context.

The Forge runtime documentation lists supported Node.js major versions
(`nodejs20.x`, `nodejs22.x`, `nodejs24.x`) but does not enumerate built-in module
support, so we cannot assume `AsyncLocalStorage` survives the Forge isolate's async
boundaries until we test it.

## Local spike

A local test in Node 22 confirms that `AsyncLocalStorage`:

- Preserves context after `await Promise.resolve()`.
- Preserves context through nested async function calls.
- Isolates concurrent invocations running under `Promise.all`.
- Returns `undefined` outside any `run` scope.

The test is committed as `test/async-local-storage-spike.test.ts`.

## Open question

The local spike proves the Node.js API behaves as expected. It does **not** prove
that the Forge platform preserves the same async context across its own event-loop
boundaries, isolation resets, or queue hand-offs.

## Decision

Proceed with an `AsyncLocalStorage` implementation for `withLogContext` in ticket 08,
but design it so that the public API does not leak the storage mechanism. If a real
Forge deployment shows that `AsyncLocalStorage` does not survive, we can swap the
implementation to an invocation-scoped logger passed through the handler wrapper
without changing the `withLogContext` call shape.

## Recommended next step

Before relying on ambient context in production, deploy the spike function to a real
Forge resolver or web trigger and verify that context set at the entry point is still
readable after the platform's async boundaries.
