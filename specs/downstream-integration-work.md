# Downstream Integration Work for `@forge-ahead/logging`

## Status

Implemented.

This document is the spec for follow-up work in downstream repositories. No
source code in other repositories is modified here; only the guidance and
acceptance criteria live in this repository.

## Context

`@forge-ahead/logging` is now the standalone logging package. Existing
`forge-ahead` consumers, generated Forge app templates, and lint tooling need
follow-up work to wire `LOG_LEVEL` correctly and to migrate imports. The
following sections describe what each downstream package or tool should do.

---

## `forge-ahead` Package Follow-Up

### Goal

Let existing `forge-ahead` consumers migrate without changing every import
immediately. After a short deprecation window, `forge-ahead` stops re-exporting
logging APIs and consumers import from `@forge-ahead/logging` directly.

### Migration path for consumers

Old usage:

```ts
import { logContext, logResult, truncateEvents } from "forge-ahead";
```

New usage:

```ts
import { log, logResult, summarizeForLog } from "@forge-ahead/logging";
```

The most common replacements:

| `forge-ahead` helper | `@forge-ahead/logging` replacement | Notes |
|---|---|---|
| `logContext` | `withLogContext` / `getLogContext` | Returns the same ambient-context behavior. |
| `logResult(result, label?)` | `logResult(logger, result, options?)` | Requires a logger; use the default `log` or a named logger. |
| `truncateEvents` | `summarizeForLog` | Summarization is bounded and redacted by default. |
| ad-hoc `console.log` wrappers | `installConsoleCapture(logger)` | Optional; captures third-party `console.*` output. |

### Re-export plan

1. Add `@forge-ahead/logging` as a dependency of `forge-ahead`.
2. Re-export the following APIs from `forge-ahead` for **one minor release**:
   - `log`
   - `createForgeLogger`
   - `logResult`
   - `logError`
   - `withLogContext`
   - `getLogContext`
   - `summarizeForLog`
   - `logForgeInvocation`
3. Mark the re-exports as `@deprecated` with a JSDoc tag pointing to the
   standalone package.
4. Remove the re-exports in the **next minor release** after the deprecation
   release. The exact version is left to the `forge-ahead` release plan.

### Internal changes

- Update `forge-ahead` internal imports that currently read from
  `src/forge/logging.ts` to import from `@forge-ahead/logging`.
- Keep API-route response builders in `forge-ahead`; only their request logging
  should depend on the new logging package.

### Acceptance criteria

- Existing consumers can compile during the migration window.
- New code examples in `forge-ahead` README/docs import from `@forge-ahead/logging`.
- Deprecated re-exports have a clear `@deprecated` JSDoc comment and removal
  version.

---

## `repo-init` Template Follow-Up

### Goal

Generated Forge app templates declare and publish `LOG_LEVEL` as a non-secret
Forge runtime variable with a default of `info`.

### Required changes

1. Add `LOG_LEVEL` to `templates/secretspec/secretspec.toml`:

   ```toml
   [LOG_LEVEL]
   type = "string"
   default = "info"
   required = true
   description = "Minimum log level emitted by the app."
   ```

2. Ensure `LOG_LEVEL` is marked as non-secret in the template and in any
   generated docs. It must not be encrypted.

3. Update `templates/scripts/forge-vars-from-secretspec.sh` so that it publishes
   `LOG_LEVEL` with `forge variables:set`, not
   `forge variables:set-encrypted`:

   ```sh
   forge variables:set LOG_LEVEL "$LOG_LEVEL"
   ```

4. Add or update repo-init tests that generate a Forge app and assert:
   - `LOG_LEVEL` is present in the generated `secretspec.toml`.
   - The default value is `info`.
   - The variable push script contains `forge variables:set LOG_LEVEL`.

### Acceptance criteria

- Generated Forge app templates include `LOG_LEVEL` with a default of `info`.
- The variable push script treats `LOG_LEVEL` as non-encrypted.
- Template tests fail if `LOG_LEVEL` is removed or changed to a secret.

---

## `forge-prelint` Follow-Up

### Goal

Detect Forge projects that depend on `@forge-ahead/logging` but have no managed
path for setting `LOG_LEVEL`.

### Required rule

Activate or replace the placeholder `use-forge-variables-set-secretspec` rule
with a new rule named `forge-ahead-logging-requires-log-level`.

Rule behavior:

1. If the project does not depend on `@forge-ahead/logging`, do nothing.
2. If the project depends on `@forge-ahead/logging`, require that it contains
   the agreed SecretSpec-managed `LOG_LEVEL` wiring.
3. Detect `LOG_LEVEL` wiring by checking for:
   - `LOG_LEVEL` in `secretspec.toml` with a non-secret type; or
   - `LOG_LEVEL` in the `forge variables:set` publish script.

### Suggested rule implementation

- Load `package.json` and check `dependencies` / `devDependencies` for
  `@forge-ahead/logging`.
- Load `secretspec.toml` (if present) and look for a `[LOG_LEVEL]` entry.
- Load the variable-push script and look for `forge variables:set LOG_LEVEL`.
- Pass if either source of wiring is found.
- Fail if the dependency is present but neither source of wiring is found.

### Rule message

```
Projects using @forge-ahead/logging must declare LOG_LEVEL as a non-secret
Forge runtime variable. Add [LOG_LEVEL] to secretspec.toml and publish it with
"forge variables:set LOG_LEVEL", not the encrypted setter.
```

### Fixtures

Add passing and failing fixtures:

- `fixtures/forge-ahead-logging-with-log-level/` — depends on the package and
  has `LOG_LEVEL` in `secretspec.toml`.
- `fixtures/forge-ahead-logging-without-log-level/` — depends on the package
  but has no `LOG_LEVEL` wiring.

### Acceptance criteria

- A Forge project using `@forge-ahead/logging` without `LOG_LEVEL` wiring fails
  prelint.
- A Forge project with the SecretSpec-managed `LOG_LEVEL` path passes.
- The rule message explains how to add the missing variable wiring.

---

## Summary of downstream commits

| Repository | Type | Work |
|---|---|---|
| `forge-ahead` | Dependency + re-exports + internal migration | Adopt `@forge-ahead/logging`; deprecate re-exports for one release. |
| `repo-init` | Template | Add `LOG_LEVEL` to generated Forge app SecretSpec and publish script. |
| `forge-prelint` | Rule | Add `forge-ahead-logging-requires-log-level` rule. |

None of these changes are applied in this repository.
