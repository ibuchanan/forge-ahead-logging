# Downstream Integration Work for `@forge-ahead/logging`

## Status

Draft.

## Context

The standalone `@forge-ahead/logging` package is implemented in this repository.
Other Forge Ahead packages may need follow-up edits to adopt it, but those edits
belong in their own repositories or package workspaces.

## `forge-ahead` Package Follow-Up

Goal: let existing `forge-ahead` consumers migrate without changing every import
immediately.

Candidate work:

- Add `@forge-ahead/logging` as a dependency of `forge-ahead`.
- Re-export selected logging APIs from `forge-ahead` for one release window.
- Mark console-oriented helpers such as `truncateEvents`, `logContext`, and the
  old `logResult(result, label?)` usage as deprecated where they remain
  available.
- Update internal imports that currently read from `src/forge/logging.ts` to use
  the standalone package where appropriate.
- Keep API-route response builders in `forge-ahead`; only their request logging
  should depend on the new logging package.

Acceptance criteria:

- Existing consumers can compile during a migration window.
- New code examples prefer importing from `@forge-ahead/logging`.
- Deprecated re-exports have a clear removal version or release window.

## `repo-init` Template Follow-Up

Goal: generated Forge app templates declare and publish `LOG_LEVEL` as a
non-secret Forge runtime variable.

Candidate work:

- Add `LOG_LEVEL` to `templates/secretspec/secretspec.toml`.
- Keep `LOG_LEVEL` non-secret.
- Ensure `templates/scripts/forge-vars-from-secretspec.sh` publishes `LOG_LEVEL`
  with `forge:variables:set`, not `forge:variables:set-encrypted`.
- Add or update repo-init tests that generate a Forge app and assert `LOG_LEVEL`
  is present in the generated SecretSpec template.

Acceptance criteria:

- Generated Forge app templates include `LOG_LEVEL` with a default of `info`.
- The variable push script treats `LOG_LEVEL` as non-encrypted.
- Template tests fail if `LOG_LEVEL` is removed.

## `forge-prelint` Follow-Up

Goal: detect Forge projects that depend on `@forge-ahead/logging` but have no
managed path for setting `LOG_LEVEL`.

Candidate work:

- Activate or replace the placeholder `use-forge-variables-set-secretspec` rule.
- Detect `@forge-ahead/logging` in package dependencies.
- Require the project to include the agreed SecretSpec-managed variable-push
  convention for `LOG_LEVEL`.
- Add passing and failing fixtures that cover apps with and without
  `LOG_LEVEL`.

Acceptance criteria:

- A Forge project using `@forge-ahead/logging` without `LOG_LEVEL` wiring fails
  prelint.
- A Forge project with the SecretSpec-managed `LOG_LEVEL` path passes.
- The rule message explains how to add the missing variable wiring.
