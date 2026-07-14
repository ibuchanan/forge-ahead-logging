# Forge Ahead Logging

A standalone Forge-oriented logging package that provides structured, bounded,
and redacted logging helpers for Forge apps.

## Language

**Forge Logging Package**:
The standalone `@forge-ahead/logging` package owned by this repository. It
provides Forge-safe logging defaults and helpers for structured application
logs.
_Avoid_: errors package, monolibrary logging module

**Downstream Integration Work**:
Follow-up changes needed in other packages after the Forge Logging Package is
implemented. These changes are specified here but applied outside this
repository.
_Avoid_: in-scope implementation, package source work

**Problem Details**:
The RFC-style error payload shape supplied by `@forge-ahead/errors` and logged
by the Forge Logging Package without arbitrary extra fields.
_Avoid_: generic error object, thrown value

**Object Summary Policy**:
An allow-list projection that turns a rich domain object into a small,
JSON-safe log summary. Policies separate default operational fields from
opt-in human-readable labels.
_Avoid_: object logger, Atlassian object helper, raw payload logging

**Field Transform**:
A built-in, named transformation applied by an Object Summary Policy to one
selected field. Field transforms cover known safe logging behaviors such as
token previews, redaction, and omitted shape summaries without allowing
arbitrary callback code in policies.
_Avoid_: custom extractor, serializer function, mapper callback

**Log Level Resolution**:
The process of deriving the effective logger level from `LOG_LEVEL`, `NODE_ENV`,
or the package default. Resolution returns metadata about the chosen source and
invalid configured values without emitting log records as a side effect.
_Avoid_: startup warning, environment parsing side effect

**Default Redaction Backstop**:
The pino redaction paths applied by the Forge Logging Package to catch common
secret-shaped fields. This is a secondary defense, not a complete model of
Forge or Atlassian payload safety.
_Avoid_: complete redaction policy, primary payload safety mechanism
