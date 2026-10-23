import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getLogLevel, resolveLogLevel } from "../src/index";

describe("resolveLogLevel", () => {
  it("defaults to info when LOG_LEVEL and NODE_ENV are absent", () => {
    expect(resolveLogLevel({})).toEqual({ level: "info", source: "default" });
  });

  it("uses a valid LOG_LEVEL value", () => {
    expect(resolveLogLevel({ LOG_LEVEL: "debug" })).toEqual({
      level: "debug",
      source: "LOG_LEVEL",
    });
  });

  it("falls back to debug in development when LOG_LEVEL is absent", () => {
    expect(resolveLogLevel({ NODE_ENV: "development" })).toEqual({
      level: "debug",
      source: "NODE_ENV",
    });
  });

  it("falls back to info and reports the invalid value for an invalid LOG_LEVEL", () => {
    expect(resolveLogLevel({ LOG_LEVEL: "verbose" })).toEqual({
      level: "info",
      source: "default",
      invalidValue: "verbose",
    });
  });

  it("applies a per-name override", () => {
    expect(
      resolveLogLevel("my-lib", { LOG_LEVEL: "info,my-lib=debug" }),
    ).toEqual({
      level: "debug",
      source: "LOG_LEVEL",
    });
  });

  it("uses the global level when no override matches the name", () => {
    expect(
      resolveLogLevel("other-lib", { LOG_LEVEL: "info,my-lib=debug" }),
    ).toEqual({
      level: "info",
      source: "LOG_LEVEL",
    });
  });

  it("treats the first segment as global level even when it contains an override", () => {
    expect(
      resolveLogLevel("my-lib", { LOG_LEVEL: "warn,my-lib=debug" }),
    ).toEqual({
      level: "debug",
      source: "LOG_LEVEL",
    });
  });

  it("reports an invalid override segment without causing a fatal error", () => {
    expect(
      resolveLogLevel("my-lib", { LOG_LEVEL: "info,my-lib=verbose" }),
    ).toEqual({
      level: "info",
      source: "LOG_LEVEL",
      invalidValue: "my-lib=verbose",
    });
  });

  it("falls back to default when no global level and no override matches", () => {
    expect(resolveLogLevel("other", { LOG_LEVEL: "my-lib=debug" })).toEqual({
      level: "info",
      source: "default",
    });
  });

  it("falls back to NODE_ENV when no global level and no override matches", () => {
    expect(
      resolveLogLevel("other", {
        LOG_LEVEL: "my-lib=debug",
        NODE_ENV: "development",
      }),
    ).toEqual({
      level: "debug",
      source: "NODE_ENV",
    });
  });
});

// Independent contract vocabulary, not derived from production constants.
const level = fc.constantFrom(
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
);
const loggerName = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

describe("resolveLogLevel properties", () => {
  it("never throws and always answers with a known level for any LOG_LEVEL text", () => {
    fc.assert(
      fc.property(
        fc.option(loggerName, { nil: undefined }),
        fc.string(),
        (name, raw) => {
          const resolved = resolveLogLevel(name, { LOG_LEVEL: raw });
          expect([
            "fatal",
            "error",
            "warn",
            "info",
            "debug",
            "trace",
          ]).toContain(resolved.level);
        },
      ),
    );
  });

  it("round-trips a valid global level, tolerating surrounding whitespace", () => {
    fc.assert(
      fc.property(level, fc.constantFrom("", " ", "  "), (expected, pad) => {
        expect(
          resolveLogLevel({ LOG_LEVEL: `${pad}${expected}${pad}` }),
        ).toEqual({
          level: expected,
          source: "LOG_LEVEL",
        });
      }),
    );
  });

  it("applies an override only to its own name", () => {
    fc.assert(
      fc.property(
        level,
        level,
        loggerName,
        loggerName,
        (global, override, target, other) => {
          fc.pre(target !== other);
          const env = { LOG_LEVEL: `${global},${target}=${override}` };
          expect(resolveLogLevel(target, env).level).toBe(override);
          expect(resolveLogLevel(other, env).level).toBe(global);
        },
      ),
    );
  });

  it("reports only a trimmed segment of the input as the invalid value", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), level, (bad, valid) => {
        fc.pre(bad.trim() !== "");
        const raw = `${valid},${bad}`;
        const { invalidValue } = resolveLogLevel({ LOG_LEVEL: raw });
        if (invalidValue !== undefined) {
          expect(raw.split(",").map((s) => s.trim())).toContain(invalidValue);
        }
      }),
    );
  });
});

describe("getLogLevel", () => {
  it("returns only the resolved level", () => {
    expect(getLogLevel({ LOG_LEVEL: "warn" })).toBe("warn");
  });
});
