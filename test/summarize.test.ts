import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type JSONValue, summarizeForLog } from "../src/index";
import { secretKey, secretKeys } from "./privacy-arbitraries";

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

  it("preserves string prefixes and accounts for every omitted UTF-16 code unit", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 300, unit: "binary" }),
        fc.nat({ max: 320 }),
        (value, maxStringLength) => {
          const result = summarizeForLog(value, { maxStringLength }) as string;
          if (value.length <= maxStringLength) {
            expect(result).toBe(value);
          } else {
            expect(result.slice(0, maxStringLength)).toBe(
              value.slice(0, maxStringLength),
            );
            const marker = result
              .slice(maxStringLength)
              .match(/^\.\.\.\[(\d+) chars omitted\]$/);
            expect(marker).not.toBeNull();
            expect(maxStringLength + Number(marker?.[1])).toBe(value.length);
          }
        },
      ),
      {
        examples: [
          ["", 0],
          ["abc", 0],
          ["abc", 2],
          ["abc", 3],
          ["abc", 4],
          ["😀x", 1],
        ],
      },
    );
  });

  it("retains the array prefix and accounts for every omitted item at any item limit", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 40 }),
        fc.nat({ max: 45 }),
        (value, maxArrayItems) => {
          const input = Object.freeze(value);
          const result = summarizeForLog(input, {
            maxArrayItems,
          }) as JSONValue[];
          const retained = Math.min(value.length, maxArrayItems);
          expect(result.slice(0, retained)).toEqual(value.slice(0, retained));
          if (value.length <= maxArrayItems) {
            expect(result).toEqual(value);
          } else {
            expect(result).toHaveLength(maxArrayItems + 1);
            expect(result.at(-1)).toBe(
              `[${value.length - retained} more items omitted]`,
            );
          }
        },
      ),
      {
        examples: [
          [[], 0],
          [[1], 0],
          [[1, 2], 1],
          [[1, 2], 2],
          [[1, 2], 3],
        ],
      },
    );
  });

  it("retains object entry order and accounts for every omitted key at any key limit", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 40 }),
        fc.nat({ max: 45 }),
        (values, maxObjectKeys) => {
          const entries = values.map(
            (value, index) => [`field${index}`, value] as const,
          );
          const input = Object.freeze(Object.fromEntries(entries));
          const result = summarizeForLog(input, { maxObjectKeys }) as Record<
            string,
            JSONValue
          >;
          const retained = Math.min(entries.length, maxObjectKeys);
          expect(Object.entries(result).slice(0, retained)).toEqual(
            entries.slice(0, retained),
          );
          if (entries.length <= maxObjectKeys) {
            expect(result).toEqual(input);
          } else {
            expect(Object.keys(result)).toHaveLength(maxObjectKeys + 1);
            expect(
              result[`[${entries.length - retained} more keys omitted]`],
            ).toBe(true);
          }
        },
      ),
      {
        examples: [
          [[], 0],
          [[1], 0],
          [[1, 2], 1],
          [[1, 2], 2],
          [[1, 2], 3],
        ],
      },
    );
  });

  it("stops mixed object/array paths exactly at maxDepth without truncating scalar leaves", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { maxLength: 24 }),
        fc.nat({ max: 26 }),
        fc.boolean(),
        (arrays, maxDepth, scalar) => {
          let input: JSONValue = scalar ? 7 : Object.freeze({ value: 7 });
          for (const array of [...arrays].reverse()) {
            input = Object.freeze(
              array ? [input] : { next: input },
            ) as JSONValue;
          }
          let result = summarizeForLog(input, { maxDepth });
          const visited = Math.min(arrays.length, maxDepth);
          for (const array of arrays.slice(0, visited)) {
            expect(Array.isArray(result)).toBe(array);
            result = array
              ? (result as JSONValue[])[0]
              : (result as Record<string, JSONValue>).next;
          }
          expect(result).toEqual(
            maxDepth < arrays.length || (maxDepth === arrays.length && !scalar)
              ? "[max depth reached]"
              : scalar
                ? 7
                : { value: 7 },
          );
        },
      ),
      {
        examples: [
          [[], 0, false],
          [[], 0, true],
          [[true, false], 1, false],
          [[false, true], 2, false],
          [[true, false], 2, true],
          [[false, true], 3, false],
        ],
      },
    );
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

  it("redacts every contract secret key at any casing", () => {
    fc.assert(
      fc.property(secretKey, (key) => {
        expect(summarizeForLog({ [key]: "secret-value" })).toEqual({
          [key]: "[redacted]",
        });
      }),
      { examples: secretKeys.map((key): [string] => [key]) },
    );
  });
});
