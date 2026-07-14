# @forge-ahead/logging

<!-- cspell:words neverthrow -->

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)

TypeScript error helpers for Forge Ahead packages. The package combines
[RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html) with
[`neverthrow`](https://github.com/supermacro/neverthrow) `Result` values so
callers can return structured HTTP-style errors without throwing.

This package is currently private (`"private": true` in `package.json`), so use
it from this repository or a configured private workspace rather than installing
it from the public npm registry.

In a consuming Forge app with access to the package registry:

```sh
npm install @forge-ahead/errors
```

## Why this exists

`Result<T, E>` makes failure part of the function type. The underlying
`neverthrow` package describes a `Result` as either success (`Ok`) or failure
(`Err`), and recommends consuming results with methods such as `.match()` or
`.unwrapOr()` so errors are handled explicitly.

That explicitness matters in Forge apps because Forge has more than one error
channel:

- [Forge resolver](https://developer.atlassian.com/platform/forge/runtime-reference/forge-resolver/)
  and
  [`invoke`](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/invoke/)
  types allow resolver functions to return `void`. For functions that otherwise
  have no domain return value, a thrown exception is easy to miss in the type
  contract. Returning `Result<void, ProblemDetails>` keeps the failure path
  visible.
- [Web trigger](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/)
  and
  [scheduled trigger](https://developer.atlassian.com/platform/forge/function-reference/scheduled-trigger/)
  responses are interpreted by the Forge platform. Invalid web trigger responses
  become `500` responses, scheduled trigger responses that do not match the
  expected shape are recorded as `424 Failed dependency`, and `500`-series
  scheduled trigger status codes are treated as errors.
- [Async events](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/)
  are retried automatically until successful within the retention window. Forge
  considers runtime errors, timeouts, out-of-memory failures, network errors,
  insufficient permissions, and invocation limits to be app-level errors. A
  handler can also return an `InvocationError` to request a retry explicitly.

The practical rule is: do not rely on thrown exceptions as the contract between
Forge app functions. Return a typed `Result` with `ProblemDetails` instead, then
translate that result at the Forge boundary. This gives humans and AI coding
agents early feedback in code review and type checking, before an error becomes
a swallowed `void`, a Forge-level platform error, or an unintended queued-event
retry at runtime.

## Usage

The package is published as ESM and targets Node 22 or newer, matching
Atlassian's recommended Forge runtime floor for new deployments.

```ts
import {
  ok,
  StandardError,
  type ProblemDetails,
  type Result,
} from "@forge-ahead/errors";

export function requireManifestPath(
  path?: string,
): Result<string, ProblemDetails> {
  if (!path) {
    return StandardError.getOrDefault(404).error("manifest.yml not found");
  }

  return ok(path);
}

const result = requireManifestPath(undefined);

result.match(
  (path) => console.log(path),
  (problem) => console.error(problem.status, problem.detail),
);
```

## Setup

Use Node 22 or newer and npm for the local package workflow:

```sh
npm install
npm run build
```

## Development

Common package scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the ESM package with `tsdown`. |
| `npm run dev` | Rebuild with `tsdown --watch`. |
| `npm run check` | Run lint, format, and TypeScript checks. |
| `npm run format` | Format files with Biome. |
| `npm run lint:fix` | Apply Biome lint fixes. |
| `npm test` | Run the Vitest test suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:coverage` | Run Vitest with coverage reporting. |
| `npm run changelog` | Generate changelog output with `git cliff`. |

## API Surface

- `ProblemDetails` and `ValidationProblemDetails` model RFC 9457-style error
  payloads.
- `StandardError` registers HTTP status/title pairs and returns
  `Result<never, ProblemDetails>` from `error()`.
- `isProblemDetails`, `toErrorMessage`, `toProblemDetails`, and `problemResult`
  normalize unknown thrown values into `ProblemDetails`.
- `ShellExitCodes` documents common shell exit codes.
- Core `neverthrow` exports such as `ok`, `err`, `Result`, `ResultAsync`, and
  `safeTry` are re-exported so consumers can import from one package.

`StandardError.toExitCode()` intentionally returns `1` for all supplied status
codes; success paths should exit with `0` without calling it.

## Project Layout

- `src/errors.ts` contains the package implementation and public exports.
- `test/errors.test.ts` covers the Problem Details shape, standard errors, and
  conversion helpers.
- `tsdown.config.ts` builds `src/errors.ts` as the package entrypoint.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for repository contribution guidance.

## License

Apache-2.0. See [LICENSE](LICENSE).
