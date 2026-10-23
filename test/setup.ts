import fc from "fast-check";

// Deeper search in CI; failures print their seed, so reproduce with `fc.assert(..., { seed })`.
fc.configureGlobal({ numRuns: process.env.CI ? 1000 : 100 });
