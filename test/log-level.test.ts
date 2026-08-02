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

describe("getLogLevel", () => {
  it("returns only the resolved level", () => {
    expect(getLogLevel({ LOG_LEVEL: "warn" })).toBe("warn");
  });
});
