import fc from "fast-check";
import { assert, describe, expect, it } from "vitest";
import { type JSONValue, summarizeForLog } from "../src/index";
import { summarizeShapeForLog } from "../src/summarize";
import {
  plant,
  plantedValue,
  secretKey,
  secretKeys,
} from "./privacy-arbitraries";

describe("summarizeForLog", () => {
  it("passes through JSON-safe primitives unchanged", () => {
    expect(summarizeForLog(42)).toBe(42);
    expect(summarizeForLog("hello")).toBe("hello");
    expect(summarizeForLog(true)).toBe(true);
    expect(summarizeForLog(null)).toBe(null);
  });

  it("applies the default budgets of 240 characters, 5 array items, and 12 object keys", () => {
    expect(summarizeForLog("a".repeat(241))).toBe(
      `${"a".repeat(240)}...[omitted: 1 chars]`,
    );
    expect(summarizeForLog([1, 2, 3, 4, 5, 6])).toEqual([
      1,
      2,
      3,
      4,
      5,
      "[omitted: 1 items]",
    ]);
    const keys = Array.from({ length: 13 }, (_, i) => [`key${i}`, i] as const);
    expect(summarizeForLog(Object.fromEntries(keys))).toEqual({
      ...Object.fromEntries(keys.slice(0, 12)),
      "[omitted: 1 keys]": true,
    });
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
              .match(/^\.\.\.\[omitted: (\d+) chars\]$/);
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
              `[omitted: ${value.length - retained} items]`,
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
            expect(result[`[omitted: ${entries.length - retained} keys]`]).toBe(
              true,
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
            const child = array
              ? (result as JSONValue[])[0]
              : (result as Record<string, JSONValue>)["next"];
            assert.isDefined(child);
            result = child;
          }
          const leafDepth = arrays.length + Number(!scalar);
          expect(result).toEqual(
            maxDepth < leafDepth
              ? "[omitted: max depth]"
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
    obj["self"] = obj;

    const result = summarizeForLog(obj) as Record<string, unknown>;

    expect(result["name"]).toBe("root");
    expect(result["self"]).toBe("[omitted: circular]");
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

  it("never invokes getters, whether retained, omitted, or secret-shaped", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("plain", "accessor", "secret"), {
          maxLength: 8,
        }),
        fc.nat({ max: 9 }),
        (kinds, maxObjectKeys) => {
          let reads = 0;
          const input: Record<string, unknown> = {};
          for (const [index, kind] of kinds.entries()) {
            const key =
              kind === "secret"
                ? (secretKeys[index] ?? "secret")
                : `field${index}`;
            if (kind === "plain") {
              input[key] = index;
            } else {
              Object.defineProperty(input, key, {
                enumerable: true,
                get() {
                  reads += 1;
                  throw new Error("getter ran");
                },
              });
            }
          }
          expect(() => summarizeForLog(input, { maxObjectKeys })).not.toThrow();
          expect(reads).toBe(0);
        },
      ),
    );
  });

  it("marks an accessor that falls within the key budget", () => {
    const input = Object.defineProperty({}, "lazy", {
      enumerable: true,
      get: () => "value",
    });
    expect(summarizeForLog(input)).toEqual({ lazy: "[accessor]" });
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

describe("omission markers", () => {
  const shapeOf = (value: unknown, options = {}) =>
    summarizeShapeForLog(value, options) as {
      omitted?: number | string;
      values: { omitted?: number | string }[];
    };

  it("name a depth cutoff with the structural reason", () => {
    const input = { a: { b: 1 } };
    const reason = shapeOf(input, { maxDepth: 1 }).values[0]?.omitted;

    expect(reason).toBe("max depth");
    expect(summarizeForLog(input, { maxDepth: 1 })).toEqual({
      a: `[omitted: ${reason}]`,
    });
  });

  it("name a cycle with the structural reason", () => {
    const input: Record<string, unknown> = {};
    input["self"] = input;
    const reason = shapeOf(input).values[0]?.omitted;

    expect(reason).toBe("circular");
    expect(summarizeForLog(input)).toEqual({ self: `[omitted: ${reason}]` });
  });

  it("count omitted items and keys with the structural count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.nat({ max: 29 }),
        (length, limit) => {
          fc.pre(length > limit);
          const items = Array.from({ length }, (_, index) => index);
          const keyed = Object.fromEntries(items.map((n) => [`k${n}`, n]));
          const count = shapeOf(items, { maxArrayItems: limit }).omitted;
          const keyCount = shapeOf(keyed, { maxObjectKeys: limit }).omitted;

          expect(count).toBe(length - limit);
          expect(
            (summarizeForLog(items, { maxArrayItems: limit }) as unknown[]).at(
              -1,
            ),
          ).toBe(`[omitted: ${count} items]`);
          expect(
            summarizeForLog(keyed, { maxObjectKeys: limit }),
          ).toHaveProperty([`[omitted: ${keyCount} keys]`], true);
        },
      ),
    );
  });
});

describe("summarizeShapeForLog", () => {
  const limits = fc.record({
    maxDepth: fc.nat({ max: 5 }),
    maxArrayItems: fc.nat({ max: 6 }),
    maxObjectKeys: fc.nat({ max: 6 }),
  });

  type ShapeOptions = {
    maxDepth: number;
    maxArrayItems: number;
    maxObjectKeys: number;
  };

  function leafShape(input: unknown): unknown {
    if (input === null) return { type: "null" };
    if (typeof input === "string") {
      return { type: "string", length: input.length };
    }
    return { type: typeof input };
  }

  // Expected shape computed from the contract: exact counts, the retained input
  // prefix, and `omitted` equal to exactly what was dropped.
  function expectedShape(
    input: unknown,
    options: ShapeOptions,
    depth = 0,
  ): unknown {
    if (input === null || typeof input !== "object") return leafShape(input);
    const isArray = Array.isArray(input);
    const type = isArray ? "array" : "object";
    if (depth >= options.maxDepth) return { type, omitted: "max depth" };
    const children = isArray ? input : Object.values(input);
    const limit = isArray ? options.maxArrayItems : options.maxObjectKeys;
    return {
      type,
      [isArray ? "items" : "keys"]: children.length,
      values: children
        .slice(0, limit)
        .map((child) => expectedShape(child, options, depth + 1)),
      ...(children.length > limit ? { omitted: children.length - limit } : {}),
    };
  }

  it("reports exact counts and omissions for any JSON tree at any limits", () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 5 }), limits, (value, options) => {
        expect(summarizeShapeForLog(value, options)).toEqual(
          expectedShape(value, options),
        );
      }),
    );
  });

  it("never emits leaf contents or canary-named keys, however deeply the canary is planted", () => {
    fc.assert(
      fc.property(plant, limits, (p, options) => {
        const shape = summarizeShapeForLog(
          { [p.root]: plantedValue(p) },
          options,
        );
        expect(JSON.stringify(shape)).not.toContain(p.canary);
      }),
    );
  });
});
