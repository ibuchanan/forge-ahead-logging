# Keep Demo Narrative Logging behind a separate subpath

Demo Narrative Logging is example-code logging that deliberately tells a story
in structured log records, so it is useful for static demos but is not a normal
production logging pattern. We will expose it from an explicit demo-oriented
API surface, such as `@forge-ahead/logging/demo`, rather than from the root
package export. This keeps the root `@forge-ahead/logging` API production-safe
by default, makes demo-only imports easy to spot in review or lint rules, and
still lets the demo helper write through the same structured `ForgeLogger`
records as the rest of the package.
