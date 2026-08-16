# Development

This guide covers the local development loop for `@forge-ahead/logging` itself. It is for contributors working in this repository; package consumers should start with the [README](README.md) and the [Diátaxis documentation](docs/).

## Documentation map

| Topic | Document |
| --- | --- |
| Learn by building a Forge resolver integration | [Tutorial](docs/tutorial.md) |
| Configure, operate, or troubleshoot logging | [How-to guides](docs/how-to.md) |
| Inspect the package API and defaults | [Reference](docs/reference.md) |
| Understand the package’s design | [Explanation](docs/explanation.md) |

Keep the four documents focused on their respective Diátaxis quadrants. Add procedures to the how-to guide, API facts to the reference, conceptual rationale to the explanation, and beginner lessons to the tutorial rather than expanding this contributor guide with consumer documentation.

## Prerequisites

Use Node.js 22 or newer and npm. The required Node version is also declared in `package.json`.

## Setup

From the repository root:

```sh
npm install
npm run build
```

## Common scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the ESM and CommonJS package outputs with `tsdown`. |
| `npm run dev` | Rebuild with `tsdown --watch`. |
| `npm run check` | Run the repository’s pre-push checks. |
| `npm run format` | Format files with Biome. |
| `npm run format:check` | Check formatting without writing changes. |
| `npm run lint:fix` | Apply Biome lint fixes. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:coverage` | Run Vitest with coverage reporting. |
| `npm run changelog` | Generate changelog output with `git cliff`. |

Before submitting a change, run:

```sh
npm run check
```

Run the narrower commands while iterating when they provide faster feedback.

## Project layout

- `src/index.ts` contains the production implementation and root public exports.
- `src/demo.ts` contains the demo-oriented entry point.
- `src/testing.ts` contains test-support exports.
- `test/*.test.ts` covers logging behavior, summaries, redaction, context, invocation wrappers, and test helpers.
- `docs/` contains the consumer-facing Diátaxis documentation and architecture decision records.
- `tsdown.config.ts` builds the package entry points.
- `specs/` contains design specifications and follow-up integration work.

## Making documentation changes

When changing a public API or behavior:

1. Update the relevant [reference](docs/reference.md) entry.
2. Update or add a focused [how-to guide](docs/how-to.md) if the change affects an operational task.
3. Update the [tutorial](docs/tutorial.md) only when the beginner path no longer works.
4. Update the [explanation](docs/explanation.md) when the design rationale changes.
5. Keep README changes limited to routing, orientation, and a minimal usage example.

Validate Markdown links and run `git diff --check` before submitting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards.
