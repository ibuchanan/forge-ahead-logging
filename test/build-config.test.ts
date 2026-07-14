import { describe, expect, it } from "vitest";
import tsdownConfig from "../tsdown.config";

describe("build entrypoint", () => {
  it("builds from the package skeleton entry, not the copied errors module", () => {
    expect(tsdownConfig.entry).toEqual({ index: "./src/index.ts" });
  });
});
