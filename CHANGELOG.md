# Changelog

All notable changes to this project are documented here.

## [0.6.0] - 2026-10-24

### 🚀 Features

- _(logging)_ Add Result-based W3C trace context helpers

## [0.5.0] - 2026-10-23

### 🚀 Features

- _(logging)_ [**breaking**] Validate reviewable summary policies

### 🐛 Bug Fixes

- _(logging)_ [**breaking**] Minimize built-in invocation summaries
- _(logging)_ [**breaking**] Make automatic error logs allow-list based
- _(logging)_ [**breaking**] Keep diagnostics structural by default
- _(logging)_ [**breaking**] Redact deep record secrets
- _(logging)_ Stop summarizeForLog from invoking getters
- _(logging)_ Derive the redact paths and key matcher from one key list

### 🚜 Refactor

- _(logging)_ Split index into focused modules
- _(logging)_ Simplify error metadata plumbing
- _(logging)_ Tidy summary policy validation
- _(logging)_ [**breaking**] Remove tokenPreview and unused env args
- _(logging)_ Split invocation, probe, and console out of index
- _(logging)_ Format each log line with a single destination pass
- _(logging)_ Normalize log call input once
- _(logging)_ Move log level resolution into its own module
- _(logging)_ Move ambient log context into its own module
- _(logging)_ Move log destination and formatting into a module
- _(logging)_ Break the index import cycle with a leaf types module
- _(logging)_ Replace logger registries with explicit state
- _(logging)_ Split the logger and default logger out of index
- _(logging)_ Simplify the error cause walk
- _(logging)_ Share the errorPolicy option across error logging
- _(logging)_ Simplify the invocation logging closures
- _(logging)_ Summarize policy fields through summarizeForLog
- _(logging)_ Tighten the probe metadata type and helpers
- _(logging)_ Name the redaction budget and fold applyToJSON into key
- _(logging)_ [**breaking**] Report omittedShape in the structural shape format
- _(logging)_ [**breaking**] Take an options object in resolveLogLevel
- _(logging)_ [**breaking**] Name value summary omissions like structural shapes
- _(logging)_ [**breaking**] Mark record-level cycles like summary cycles

### 📚 Documentation

- Link Forge logging privacy guidelines

### 🧪 Testing

- _(logging)_ Add fast-check privacy properties
- _(logging)_ Cover summary bounds with properties
- _(logging)_ Cover error trees with properties
- _(logging)_ Add canary privacy property and prune subsumed tests
- _(logging)_ Collapse privacy matrices over log levels
- _(logging)_ Add properties for log levels, formatting, and shapes
- _(logging)_ Share one failure builder across the property tests

### ⚙️ Miscellaneous Tasks

- Expand development ignore rules
- _(tooling)_ Align with forge-ranch standards
- _(tooling)_ Install lint and pack tools as devDependencies
- _(release)_ V0.5.0

## [0.4.1] - 2026-08-23

### 🐛 Bug Fixes

- _(logging)_ Order core log keys

### 📚 Documentation

- Restructure documentation around Diataxis

### ⚙️ Miscellaneous Tasks

- _(release)_ V0.4.1

## [0.4.0] - 2026-08-09

### 🚀 Features

- _(logging)_ Add domain-error logging and MinimalLogger interface

### ⚙️ Miscellaneous Tasks

- _(specs)_ Remove used up specs
- _(release)_ V0.4.0

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

### ⚙️ Miscellaneous Tasks

- _(release)_ V0.3.0 (breaking)

## [0.2.5] - 2026-07-23

### 🐛 Bug Fixes

- _(logger)_ Route Forge destination through console.* methods

### ⚙️ Miscellaneous Tasks

- _(release)_ V0.2.5

## [0.2.4] - 2026-07-23

### 🐛 Bug Fixes

- _(logger)_ Force synchronous pino destination to prevent dropped logs

### ⚙️ Miscellaneous Tasks

- _(release)_ V0.2.4

## [0.2.3] - 2026-07-23

### 🐛 Bug Fixes

- _(exports)_ Add CJS build output for require() consumers

### ⚙️ Miscellaneous Tasks

- _(release)_ V0.2.3

## [0.2.2] - 2026-07-21

### 🐛 Bug Fixes

- _(exports)_ Resolve ./demo subpath under classic TS resolution

### ⚙️ Miscellaneous Tasks

- _(release)_ V0.2.2

## [0.2.1] - 2026-07-19

### 🐛 Bug Fixes

- _(build)_ Stabilize install-time build

### 💼 Other

- Ensure build runs in prepare hook

### ⚙️ Miscellaneous Tasks

- Regenerate CHANGELOG.md and update project hooks
- _(release)_ V0.2.1

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
