import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

describe("package metadata", () => {
  it("declares @forge-ahead/errors as a runtime dependency", () => {
    expect(pkg.dependencies).toHaveProperty("@forge-ahead/errors");
  });
});
