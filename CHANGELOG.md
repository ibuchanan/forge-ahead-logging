## [0.2.5] - 2026-07-23

### 🐛 Bug Fixes

- *(logger)* Route Forge destination through console.* methods

## [0.2.4] - 2026-07-23

### 🐛 Bug Fixes

- *(logger)* Force synchronous pino destination to prevent dropped logs

## [0.2.3] - 2026-07-23

### 🐛 Bug Fixes

- *(exports)* Add CJS build output for require() consumers

## [0.2.2] - 2026-07-21

### 🐛 Bug Fixes

- *(exports)* Resolve ./demo subpath under classic TS resolution

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
