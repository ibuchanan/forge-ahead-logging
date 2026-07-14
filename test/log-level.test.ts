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
});

describe("getLogLevel", () => {
  it("returns only the resolved level", () => {
    expect(getLogLevel({ LOG_LEVEL: "warn" })).toBe("warn");
  });
});
