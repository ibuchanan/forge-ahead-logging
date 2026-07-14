import { describe, expect, it } from "vitest";
import { summarizeForLog } from "../src/index";

describe("summarizeForLog", () => {
  it("passes through JSON-safe primitives unchanged", () => {
    expect(summarizeForLog(42)).toBe(42);
    expect(summarizeForLog("hello")).toBe("hello");
    expect(summarizeForLog(true)).toBe(true);
    expect(summarizeForLog(null)).toBe(null);
  });

  it("truncates long strings with an omitted character count", () => {
    const longString = "a".repeat(300);

    const result = summarizeForLog(longString);

    expect(result).toBe(`${"a".repeat(240)}...[60 chars omitted]`);
  });

  it("bounds arrays to maxArrayItems plus an omitted-items marker", () => {
    const result = summarizeForLog([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(result).toEqual([1, 2, 3, 4, 5, "[3 more items omitted]"]);
  });

  it("bounds objects to maxObjectKeys plus an omitted-keys marker", () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 15; i++) {
      obj[`key${i}`] = i;
    }

    const result = summarizeForLog(obj);

    const expected: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++) {
      expected[`key${i}`] = i;
    }
    expected["[3 more keys omitted]"] = true;
    expect(result).toEqual(expected);
  });

  it("replaces circular references with a marker", () => {
    const obj: Record<string, unknown> = { name: "root" };
    obj.self = obj;

    const result = summarizeForLog(obj) as Record<string, unknown>;

    expect(result.name).toBe("root");
    expect(result.self).toBe("[circular]");
  });

  it("converts non-JSON values into string markers", () => {
    expect(summarizeForLog(undefined)).toBe("[undefined]");
    expect(summarizeForLog(() => {})).toBe("[function]");
    expect(summarizeForLog(Symbol("s"))).toBe("[symbol]");
    expect(summarizeForLog(10n)).toBe("[bigint 10]");
  });

  it("redacts secret-shaped keys case-insensitively", () => {
    const result = summarizeForLog({ Password: "hunter2", ok: "fine" });

    expect(result).toEqual({ Password: "[redacted]", ok: "fine" });
  });

  it("stops recursing past maxDepth", () => {
    const nested = { a: { b: { c: { d: "too deep" } } } };

    const result = summarizeForLog(nested, { maxDepth: 2 }) as Record<
      string,
      Record<string, unknown>
    >;

    expect(result.a.b).toBe("[max depth reached]");
  });
});
