## [0.4.1] - 2026-08-23

### 🐛 Bug Fixes

- *(logging)* Order core log keys

### 📚 Documentation

- Restructure documentation around Diataxis

## [0.4.0] - 2026-08-09

### 🚀 Features

- *(logging)* Add domain-error logging and MinimalLogger interface

### ⚙️ Miscellaneous Tasks

- *(specs)* Remove used up specs

## [0.3.0] - 2026-08-02

### 🚀 Features

- _(testing)_ Add public testing subpath with createCapturingLogger
- _(logger)_ Add ready-to-use default log export
- _(logger)_ [**breaking**] Emit string level labels in records
- _(logger)_ Accept message-only calls on level methods
- _(logger)_ Accept lazy metadata thunks on level methods
- _(logger)_ Add dynamic-level logger.log method
- _(logger)_ Add ambient log context with withLogContext
- _(logger)_ Add invocation wrapper with duration and failures
- _(logger)_ Add bounded cause chains, AggregateError, and stack truncation
- _(logger)_ Add namespace-level LOG_LEVEL overrides
- _(logger)_ Add monochrome pretty mode for local development
- _(logger)_ Add opt-in console capture for third-party dependencies
- _(logger)_ Add configuration helper and per-record metadata enrichment
- _(logger)_ Add narrow env-var diagnostic toggles
- _(logger)_ Add optional ISO-8601 timestamp format
- _(logger)_ Add message formatting convenience for level methods

### 💼 Other

- _(loguru)_ Feature experiment

### 📚 Documentation

- _(specs)_ Add feature tickets for Loguru-inspired DX improvements
- _(adr)_ Spike AsyncLocalStorage for ambient log context
- _(specs)_ Add Loguru-inspired DX feature suggestions
- _(downstream)_ Add downstream integration guidance for forge-ahead, repo-init, and forge-prelint

## [Unreleased]

### ⚠️ Output Shape Change

- Records emitted by `createForgeLogger()` and the default `log` export now
  carry a string `level` field (`"info"`, `"debug"`, etc.) instead of the
  pino numeric level. Downstream parsers that rely on `level` being a number
  need to be updated.
- Passing `timestamp: "iso"` (or configuring the default logger with it) changes
  the `time` field from pino epoch milliseconds to an ISO-8601 string. The
  default remains epoch milliseconds, so downstream parsers are unaffected
  unless the option is explicitly enabled.

## [0.2.5] - 2026-07-23

### 🐛 Bug Fixes

- _(logger)_ Route Forge destination through console.* methods

## [0.2.4] - 2026-07-23

### 🐛 Bug Fixes

- _(logger)_ Force synchronous pino destination to prevent dropped logs

## [0.2.3] - 2026-07-23

### 🐛 Bug Fixes

- _(exports)_ Add CJS build output for require() consumers

## [0.2.2] - 2026-07-21

### 🐛 Bug Fixes

- _(exports)_ Resolve ./demo subpath under classic TS resolution

## [0.2.1] - 2026-07-19

### 🐛 Bug Fixes

- _(build)_ Stabilize install-time build

### 💼 Other

- Ensure build runs in prepare hook

### ⚙️ Miscellaneous Tasks

- Regenerate CHANGELOG.md and update project hooks

## [0.2.0] - 2026-07-15

### 🚀 Features

- Add Debug Probe logging
- Add Demo Narrative Logging demo subpath

### 📚 Documentation

- Remove implemented Debug Probe/Demo Narrative specs

### ⚙️ Miscellaneous Tasks

- _(release)_ V0.2.0

## [0.1.0] - 2026-07-15

### 🚀 Features

- Add log level resolution and core pino logger
- Add default redaction backstop
- Add bounded summaries and Object Summary Policies
- Add Forge invocation summaries on the policy system
- Add Result and Error logging helpers

### 💼 Other

- Add release preparation script

### 🚜 Refactor

- Derive secret-shaped key names from redact paths
- Deepen error normalization
- Split summarizeValue's array/object branches

### 📚 Documentation

- Rewrite README around the real logging API
- Fix stale project name in CONTRIBUTING.md
- Split contributor-loop docs into DEVELOPMENT.md
- Define logging enhancement plan
- Record ADR for demo narrative logging subpath

### 🧪 Testing

- Remove transitional ticket-01 verification tests
- Share the stdout-capture harness across test files

### ⚙️ Miscellaneous Tasks

- Remove completed planning docs
- Fix fallow entry-point detection, ignore coverage/
- Bump Biome to 2.5.3
- Add Vitest V8 coverage provider
- Pin dependency versions
- _(release)_ Release v0.1.0
