# @forge-ahead/logging

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)

A small, opinionated, Forge-oriented wrapper around [`pino`](https://getpino.io/) for structured, bounded, and redacted backend logs.

> This package is currently private (`"private": true` in `package.json`). The installation example assumes a consuming Forge app has access to the package registry.

## Start here

Choose the documentation that matches your goal:

| I want to…                                     | Read                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Learn the package by building a Forge resolver | [Tutorial: Add structured logging to a Forge resolver](docs/tutorial.md) |
| Complete a focused operational task            | [How-to guides](docs/how-to.md)                                          |
| Look up an API, option, or default             | [Reference](docs/reference.md)                                           |
| Understand the design decisions and trade-offs | [Explanation](docs/explanation.md)                                       |
| Work on this repository                        | [Development guide](DEVELOPMENT.md)                                      |

## Install

From a consuming Forge app:

```sh
npm install @forge-ahead/logging
```

## Minimal usage

```ts
import { createForgeLogger } from "@forge-ahead/logging";

const logger = createForgeLogger({ name: "my-forge-function" });

logger.info({ operation: "sync" }, "sync started");
```

For a complete resolver integration—including ambient context, invocation lifecycle logging, bounded summaries, Forge variables, deployment, and log inspection—follow the [tutorial](docs/tutorial.md).

## What the package provides

The root package exposes production-oriented logging capabilities:
- Pino-backed `ForgeLogger` construction and a ready-to-use default logger.
- `LOG_LEVEL` resolution with environment-aware defaults.
- Ambient invocation context for stable record enrichment.
- Bounded value summaries and allow-list Object Summary Policies.
- Default redaction paths as a secondary safety backstop.
- Forge invocation, result, error, and debug-probe logging helpers.
- Temporary console capture for third-party dependencies.

Additional entry points are intentionally separated:
- `@forge-ahead/logging/demo` contains Demo Narrative Logging for examples and demonstrations.
- `@forge-ahead/logging/testing` contains capturing logger utilities for tests.

See the [API reference](docs/reference.md) for the complete public surface and supported options.

## Design boundaries

This package improves application-level log records; it does not replace Forge invocation metrics or platform logging facilities. Keep records small, structured, and explicit about the application operation. Treat default redaction as a backstop, not as permission to log arbitrary payloads.

The reasoning behind these boundaries is documented in [Why Forge logging needs structure, bounds, and context](docs/explanation.md).

## Development

For local setup, scripts, project layout, testing, and contribution workflow, see [DEVELOPMENT.md](DEVELOPMENT.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
