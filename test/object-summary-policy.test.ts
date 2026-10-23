import fc from "fast-check";
import { assert, describe, expect, it } from "vitest";
import {
  defineLogObjectSummaryPolicy,
  summarizeObjectForLog,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";
import { secretKey } from "./privacy-arbitraries";

describe("defineLogObjectSummaryPolicy", () => {
  it("returns the policy unchanged", () => {
    const policy = { kind: "widget", fields: { id: "id" } };

    expect(defineLogObjectSummaryPolicy(policy)).toBe(policy);
  });

  it("rejects a blank troubleshooting purpose at definition time", () => {
    const policy = {
      kind: "deployment",
      fields: { state: "state" },
      review: {
        purpose: "   ",
        indirectIdentifiers: { treatment: "excluded" as const },
      },
    };

    expect(() => defineLogObjectSummaryPolicy(policy)).toThrow(
      "review.purpose must be a nonblank string",
    );
  });

  it.each([
    [
      undefined,
      "review.indirectIdentifiers.treatment must be excluded or retained",
    ],
    [null, "review.indirectIdentifiers.treatment must be excluded or retained"],
    [
      { treatment: "automatic" },
      "review.indirectIdentifiers.treatment must be excluded or retained",
    ],
    [
      { treatment: "retained" },
      "review.indirectIdentifiers.justification must be a nonblank string when retained",
    ],
    [
      { treatment: "retained", justification: "  " },
      "review.indirectIdentifiers.justification must be a nonblank string when retained",
    ],
  ])(
    "rejects an incomplete identifier decision: %j",
    (indirectIdentifiers, message) => {
      const policy = {
        kind: "deployment",
        fields: { state: "state" },
        review: { purpose: "Diagnose deployment retries", indirectIdentifiers },
      };

      expect(() =>
        // @ts-expect-error Exercise invalid definitions supplied by JavaScript callers.
        defineLogObjectSummaryPolicy(policy),
      ).toThrow(message);
    },
  );
});

describe("policy definition diagnostics", () => {
  it.each<[unknown, string]>([
    [null, "policy must be an object"],
    [[], "policy must be an object"],
    [{ kind: " ", fields: {} }, "kind must be a nonblank string"],
    [{ kind: "widget" }, "fields must be a field map"],
    [{ kind: "widget", fields: null }, "fields must be a field map"],
    [{ kind: "widget", fields: [] }, "fields must be a field map"],
    [{ kind: "widget", fields: {}, labels: [] }, "labels must be a field map"],
    [{ kind: "widget", fields: {}, review: null }, "review must be an object"],
    [{ kind: "widget", fields: {}, review: [] }, "review must be an object"],
    ...[
      null,
      undefined,
      42,
      "",
      "a..b",
      [],
      [""],
      ["a", 1],
      Array(1),
      {},
      { path: null },
      { path: "state", transform: "preview" },
      { path: "state", transform: null },
    ].map((selection): [unknown, string] => [
      { kind: "widget", fields: { state: selection } },
      "fields.state must select a nonempty path and a supported transform",
    ]),
    [
      { kind: "widget", fields: {}, labels: { state: "" } },
      "labels.state must select a nonempty path and a supported transform",
    ],
  ])(
    "rejects malformed definition %j with an actionable diagnostic",
    (policy, message) => {
      expect(() =>
        // @ts-expect-error Exercise invalid definitions supplied by JavaScript callers.
        defineLogObjectSummaryPolicy(policy),
      ).toThrow(message as string);
    },
  );
});

describe("policy source-path validation", () => {
  it("rejects unsafe secret selections regardless of casing, nesting, aliases, or map", () => {
    fc.assert(
      fc.property(
        fc.record({
          key: secretKey,
          prefix: fc.array(fc.constantFrom("nested", "headers", "0"), {
            maxLength: 8,
          }),
          suffix: fc.array(fc.constantFrom("value", "0"), { maxLength: 8 }),
          alias: fc.string({ minLength: 1, maxLength: 24 }),
          map: fc.constantFrom("fields", "labels"),
          asArray: fc.boolean(),
        }),
        ({ key, prefix, suffix, alias, map, asArray }) => {
          const segments = [...prefix, key, ...suffix];
          const path = asArray ? segments : segments.join(".");
          for (const selection of [
            path,
            { path },
            { path, transform: "identity" },
          ] as const) {
            expect(() =>
              defineLogObjectSummaryPolicy({
                kind: "request",
                fields: {},
                [map]: { [alias]: selection },
              }),
            ).toThrow(
              `${map}.${alias} selects secret-shaped source path ${JSON.stringify(path)}; use redact or omittedShape, or remove the selection`,
            );
          }
          for (const transform of ["redact", "omittedShape"] as const) {
            const policy = {
              kind: "request",
              fields: {},
              [map]: { [alias]: { path, transform } },
            };
            expect(defineLogObjectSummaryPolicy(policy)).toBe(policy);
          }
        },
      ),
      {
        examples: [
          [
            {
              key: "Authorization",
              prefix: [],
              suffix: ["value"],
              alias: "publicValue",
              map: "fields",
              asArray: false,
            },
          ],
          [
            {
              key: "api_key",
              prefix: ["headers"],
              suffix: [],
              alias: "publicValue",
              map: "labels",
              asArray: true,
            },
          ],
        ],
      },
    );
  });
});

describe("reviewed policy emission", () => {
  it.each(["excluded", "retained"] as const)(
    "emits only explicit selections with %s identifiers",
    (treatment) => {
      const { logger, records } = createCapturingLogger({
        env: { LOG_LEVEL: "trace" },
      });
      const policy = defineLogObjectSummaryPolicy({
        kind: "deployment",
        fields: {
          state: "state",
          attempt: "attempt",
          ...(treatment === "retained" ? { deploymentId: "id" } : {}),
          credential: {
            path: ["headers", "Authorization"],
            transform: "redact",
          },
          credentialShape: {
            path: "headers.Authorization",
            transform: "omittedShape",
          },
        },
        labels: { operation: "operation" },
        review: {
          purpose: "Diagnose deployment retries",
          indirectIdentifiers:
            treatment === "retained"
              ? {
                  treatment,
                  justification: "Deployment ID joins failed retry records",
                }
              : { treatment },
        },
      });
      const value = Object.freeze({
        state: "failed",
        attempt: 2,
        id: "deployment-42",
        operation: "deploy",
        email: "synthetic@example.invalid",
        accountId: "synthetic-account",
        content: "synthetic customer content",
        headers: Object.freeze({ Authorization: "Bearer secret" }),
      });
      const expected = {
        kind: "deployment",
        state: "failed",
        attempt: 2,
        ...(treatment === "retained" ? { deploymentId: "deployment-42" } : {}),
        credential: "[redacted]",
        credentialShape: { omitted: true, length: 13 },
      };

      expect(defineLogObjectSummaryPolicy(policy)).toBe(policy);
      const summary = summarizeObjectForLog(value, policy);
      expect(summary).toEqual(expected);
      logger.info({ summary }, "deployment retry");
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        summary: expected,
        msg: "deployment retry",
      });
      assert.isDefined(records[0]);
      expect(records[0]["summary"]).toEqual(expected);
      const output = JSON.stringify(records);
      for (const excluded of [
        "review",
        "purpose",
        "indirectIdentifiers",
        "justification",
        "Diagnose deployment retries",
        "Deployment ID joins failed retry records",
        "synthetic@example.invalid",
        "synthetic-account",
        "synthetic customer content",
        "Bearer secret",
        '"operation"',
      ]) {
        expect(output).not.toContain(excluded);
      }
      expect(
        summarizeObjectForLog(value, policy, { includeLabels: true }),
      ).toEqual({ ...expected, operation: "deploy" });
      expect(value["headers"].Authorization).toBe("Bearer secret");
    },
  );

  it("treats custom names and identifiers as review decisions, not semantic classifications", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "operation",
      fields: { id: "id", name: "name", opaque: "domainCredential" },
      review: {
        purpose: "Inspect reviewed application fields",
        indirectIdentifiers: { treatment: "excluded" },
      },
    });

    expect(
      summarizeObjectForLog(
        { id: "op-7", name: "retry", domainCredential: "not classified" },
        policy,
      ),
    ).toEqual({
      kind: "operation",
      id: "op-7",
      name: "retry",
      opaque: "not classified",
    });
  });
});

describe("summarizeObjectForLog", () => {
  const deploymentPolicy = defineLogObjectSummaryPolicy({
    kind: "deployment",
    fields: {
      deploymentSequenceNumber: "deploymentSequenceNumber",
      updateSequenceNumber: "updateSequenceNumber",
    },
    labels: {
      displayName: "displayName",
    },
  });

  it("does not widen the allow-list when arbitrary fields or labels are added", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer(),
        fc.jsonValue({ maxDepth: 2 }),
        fc.dictionary(fc.string(), fc.jsonValue({ maxDepth: 2 })),
        (
          deploymentSequenceNumber,
          updateSequenceNumber,
          displayName,
          extra,
        ) => {
          const selected = { deploymentSequenceNumber, updateSequenceNumber };
          const expected = { kind: "deployment", ...selected };

          expect(summarizeObjectForLog(selected, deploymentPolicy)).toEqual(
            expected,
          );
          expect(
            summarizeObjectForLog(
              { ...extra, ...selected, displayName },
              deploymentPolicy,
            ),
          ).toEqual(expected);
        },
      ),
    );
  });

  it("omits fields missing from the value instead of emitting undefined", () => {
    const result = summarizeObjectForLog(
      { deploymentSequenceNumber: 42 },
      deploymentPolicy,
    );

    expect(result).toEqual({
      kind: "deployment",
      deploymentSequenceNumber: 42,
    });
    expect("updateSequenceNumber" in result).toBe(false);
  });

  it("excludes labels by default", () => {
    const deployment = {
      deploymentSequenceNumber: 42,
      updateSequenceNumber: 7,
      displayName: "prod",
    };

    const result = summarizeObjectForLog(deployment, deploymentPolicy);

    expect("displayName" in result).toBe(false);
  });

  it("includes labels when includeLabels is explicitly set", () => {
    const deployment = {
      deploymentSequenceNumber: 42,
      updateSequenceNumber: 7,
      displayName: "prod",
    };

    const result = summarizeObjectForLog(deployment, deploymentPolicy, {
      includeLabels: true,
    });

    expect(result["displayName"]).toBe("prod");
  });
});

describe("summarizeObjectForLog field transforms", () => {
  it("redacts a field when the value is present", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: { secretField: { path: "secretField", transform: "redact" } },
    });

    const result = summarizeObjectForLog({ secretField: "shh" }, policy);

    expect(result["secretField"]).toBe("[redacted]");
  });

  it("applies omittedShape by summarizing only shape metadata", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: {
        body: { path: "body", transform: "omittedShape" },
        headers: { path: "headers", transform: "omittedShape" },
        tags: { path: "tags", transform: "omittedShape" },
      },
    });

    const result = summarizeObjectForLog(
      {
        body: "0123456789",
        headers: { a: 1, b: 2 },
        tags: ["a", "b", "c"],
      },
      policy,
    );

    expect(result["body"]).toEqual({ omitted: true, length: 10 });
    expect(result["headers"]).toEqual({ omitted: true, keys: 2 });
    expect(result["tags"]).toEqual({ omitted: true, items: 3 });
  });

  it("passes identity-transformed values through summarizeForLog's budgets", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: { note: "note" },
    });
    const longNote = "x".repeat(300);

    const result = summarizeObjectForLog({ note: longNote }, policy);

    expect(result["note"]).toBe(`${"x".repeat(240)}...[60 chars omitted]`);
  });

  it("resolves nested paths via dot-string or array path", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: {
        cloudId: "context.cloudId",
        moduleKey: { path: ["context", "moduleKey"] },
      },
    });

    const result = summarizeObjectForLog(
      { context: { cloudId: "abc", moduleKey: "mod-1" } },
      policy,
    );

    expect(result["cloudId"]).toBe("abc");
    expect(result["moduleKey"]).toBe("mod-1");
  });
});
