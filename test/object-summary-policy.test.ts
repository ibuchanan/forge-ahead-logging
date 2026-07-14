import { describe, expect, it } from "vitest";
import {
  defineLogObjectSummaryPolicy,
  summarizeObjectForLog,
} from "../src/index";

describe("defineLogObjectSummaryPolicy", () => {
  it("returns the policy unchanged", () => {
    const policy = { kind: "widget", fields: { id: "id" } };

    expect(defineLogObjectSummaryPolicy(policy)).toBe(policy);
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

  it("includes policy fields by default, plus kind", () => {
    const deployment = {
      deploymentSequenceNumber: 42,
      updateSequenceNumber: 7,
      displayName: "prod",
    };

    const result = summarizeObjectForLog(deployment, deploymentPolicy);

    expect(result).toEqual({
      kind: "deployment",
      deploymentSequenceNumber: 42,
      updateSequenceNumber: 7,
    });
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

    expect(result.displayName).toBe("prod");
  });
});

describe("summarizeObjectForLog field transforms", () => {
  it("redacts a field when the value is present", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: { secretField: { path: "secretField", transform: "redact" } },
    });

    const result = summarizeObjectForLog({ secretField: "shh" }, policy);

    expect(result.secretField).toBe("[redacted]");
  });

  it("applies tokenPreview to a string by keeping the first and last three characters", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: {
        contextToken: { path: "contextToken", transform: "tokenPreview" },
      },
    });

    const result = summarizeObjectForLog(
      { contextToken: "1234567890" },
      policy,
    );

    expect(result.contextToken).toBe("123...890");
  });

  it("applies tokenPreview as redaction for non-string present values", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: { count: { path: "count", transform: "tokenPreview" } },
    });

    const result = summarizeObjectForLog({ count: 42 }, policy);

    expect(result.count).toBe("[redacted]");
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

    expect(result.body).toEqual({ omitted: true, length: 10 });
    expect(result.headers).toEqual({ omitted: true, keys: 2 });
    expect(result.tags).toEqual({ omitted: true, items: 3 });
  });

  it("passes identity-transformed values through summarizeForLog's budgets", () => {
    const policy = defineLogObjectSummaryPolicy({
      kind: "widget",
      fields: { note: "note" },
    });
    const longNote = "x".repeat(300);

    const result = summarizeObjectForLog({ note: longNote }, policy);

    expect(result.note).toBe(`${"x".repeat(240)}...[60 chars omitted]`);
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

    expect(result.cloudId).toBe("abc");
    expect(result.moduleKey).toBe("mod-1");
  });
});
