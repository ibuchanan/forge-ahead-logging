# Development

This covers the local development loop for `@forge-ahead/logging` itself.
See [README.md](README.md) for package usage.

## Setup

Use Node 22 or newer and npm for the local package workflow:

```sh
npm install
npm run build
```

## Common scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the ESM package with `tsdown`. |
| `npm run dev` | Rebuild with `tsdown --watch`. |
| `npm run check` | Run format, lint, TypeScript, and test checks. |
| `npm run format` | Format files with Biome. |
| `npm run lint:fix` | Apply Biome lint fixes. |
| `npm test` | Run the Vitest test suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:coverage` | Run Vitest with coverage reporting. |
| `npm run changelog` | Generate changelog output with `git cliff`. |

## Project Layout

- `src/index.ts` contains the package implementation and public exports.
- `test/*.test.ts` covers log level resolution, the core logger, default
  redaction, bounded summaries, Object Summary Policies, Forge invocation
  logging, and Result/Error logging.
- `tsdown.config.ts` builds `src/index.ts` as the package entrypoint.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for repository contribution guidance.
