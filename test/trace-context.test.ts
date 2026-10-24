import { randomBytes } from "node:crypto";
import type { ProblemDetails, Result } from "@forge-ahead/errors";
import { expectErr, expectOk } from "@forge-ahead/errors/testing";
import { assert, describe, expect, it, vi } from "vitest";
import {
  createTraceContext,
  formatTraceparent,
  getLogContext,
  parseTraceparent,
  type TraceContext,
  withLogContext,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const spanId = "00f067aa0ba902b7";
const header = `00-${traceId}-${spanId}-01`;
const parent: TraceContext = { traceId, spanId, traceFlags: 1 };

describe("parseTraceparent", () => {
  it("parses the W3C example and optional HTTP whitespace", () => {
    expect(expectOk(parseTraceparent(header))).toEqual(parent);
    expect(expectOk(parseTraceparent(` \t${header}\t `))).toEqual(parent);
    expect(expectOk(parseTraceparent(header.replace(/01$/, "00")))).toEqual({
      ...parent,
      traceFlags: 0,
    });
  });

  it.each([
    undefined,
    null,
    42,
    [],
    {},
    "",
    header.toUpperCase(),
    header.slice(1),
    `${header}-extra`,
    `${header}0`,
    `${header},${header}`,
    `${header}\n`,
    `\r\n${header}`,
    header.replace(spanId, `${spanId.slice(0, 8)}\r\n${spanId.slice(8)}`),
    header.replace(traceId, "0".repeat(32)),
    header.replace(spanId, "0".repeat(16)),
    header.replace(traceId, "a".repeat(31)),
    header.replace(spanId, "b".repeat(17)),
    header.replace(traceId, "g".repeat(32)),
    header.replace(/^00/, "ff"),
    header.replace(/01$/, "zz"),
  ])("returns Err for invalid or missing input: %j", (input) => {
    expect(expectErr(parseTraceparent(input))).toMatchObject({
      status: 400,
      detail: "Invalid traceparent header",
    });
  });

  it("reads future versions without retaining unknown fields", () => {
    for (const version of ["01", "fe"]) {
      expect(
        expectOk(parseTraceparent(`${version}-${traceId}-${spanId}-09-extra`)),
      ).toEqual({ ...parent, traceFlags: 9 });
      expect(
        expectOk(parseTraceparent(`${version}-${traceId}-${spanId}-01`)),
      ).toEqual(parent);
      expectErr(parseTraceparent(`${version}-${traceId}-${spanId}-01extra`));
    }
  });
});

describe("formatTraceparent", () => {
  it("preserves all incoming flag bytes but emits only the sampled bit", () => {
    for (let flags = 0; flags <= 255; flags++) {
      const encodedFlags = flags.toString(16).padStart(2, "0");
      const parsed = expectOk(
        parseTraceparent(`01-${traceId}-${spanId}-${encodedFlags}-future`),
      );
      expect(parsed.traceFlags).toBe(flags);
      expect(expectOk(formatTraceparent(parsed))).toBe(
        `00-${traceId}-${spanId}-${flags & 1 ? "01" : "00"}`,
      );
      expect(expectOk(createTraceContext({ parent: parsed })).traceFlags).toBe(
        flags & 1,
      );
    }
  });

  it("emits version 00 and masks reserved flag bits", () => {
    expect(expectOk(formatTraceparent(parent))).toBe(header);
    expect(expectOk(formatTraceparent({ ...parent, traceFlags: 0 }))).toBe(
      `00-${traceId}-${spanId}-00`,
    );
    expect(expectOk(formatTraceparent({ ...parent, traceFlags: 255 }))).toBe(
      header,
    );
    expect(expectOk(formatTraceparent({ ...parent, traceFlags: 2 }))).toBe(
      `00-${traceId}-${spanId}-00`,
    );
  });

  it.each([
    { ...parent, traceId: "0".repeat(32) },
    { ...parent, spanId: "0".repeat(16) },
    { ...parent, traceId: traceId.toUpperCase() },
    { ...parent, spanId: "secret-value" },
    { ...parent, traceId: `${"a".repeat(31)}\n` },
    { ...parent, spanId: `${"b".repeat(15)}\n` },
    { ...parent, traceId: `${"a".repeat(31)}\u2028` },
    ...[-1, 256, 0.5, Number.NaN, Number.POSITIVE_INFINITY].map(
      (traceFlags) => ({ ...parent, traceFlags }),
    ),
  ])("returns Err for invalid local contexts: %j", (context) => {
    expect(expectErr(formatTraceparent(context))).toMatchObject({
      status: 400,
      detail: "Invalid trace context",
    });
    expect(expectErr(createTraceContext({ parent: context }))).toMatchObject({
      status: 400,
      detail: "Invalid trace context",
    });
  });

  it("keeps rejected values out of errors and result logs", () => {
    const secret = "private-header-value";
    const { logger, records } = createCapturingLogger();
    const failures: Result<unknown, ProblemDetails>[] = [
      parseTraceparent(secret),
      formatTraceparent({ ...parent, traceId: secret }),
      createTraceContext({ parent: { ...parent, spanId: secret } }),
    ];
    for (const failure of failures) {
      expect(JSON.stringify(expectErr(failure))).not.toContain(secret);
      logger.result(failure);
    }
    expect(records).toHaveLength(failures.length);
    expect(JSON.stringify(records)).not.toContain(secret);
    expect(records.every((record) => record["outcome"] === "failure")).toBe(
      true,
    );
  });
});

describe("createTraceContext", () => {
  it("starts valid unsampled roots with fresh nonzero IDs", () => {
    const first = expectOk(createTraceContext());
    const second = expectOk(createTraceContext());
    expect(first.traceFlags).toBe(0);
    expect(first.parentSpanId).toBeUndefined();
    expect(
      expectOk(formatTraceparent(first).andThen(parseTraceparent)),
    ).toEqual(first);
    expect(second.traceId).not.toBe(first.traceId);
    expect(second.spanId).not.toBe(first.spanId);
  });

  it("creates independent children, retaining the trace and parent relationship", () => {
    const original = Object.freeze({ ...parent, traceFlags: 9 });
    const first = expectOk(createTraceContext({ parent: original }));
    const second = expectOk(createTraceContext({ parent: original }));
    expect(first).toEqual({
      traceId,
      spanId: expect.stringMatching(/^[\da-f]{16}$/),
      parentSpanId: spanId,
      traceFlags: 1,
    });
    expect(first.spanId).not.toBe(spanId);
    expect(second.spanId).not.toBe(first.spanId);
    expect(original).toEqual({ ...parent, traceFlags: 9 });
    const grandchild = expectOk(createTraceContext({ parent: first }));
    expect(grandchild.parentSpanId).toBe(first.spanId);
    expect(grandchild.traceId).toBe(traceId);
  });

  it("supports explicit sampling decisions for new roots and children", () => {
    expect(expectOk(createTraceContext({ sampled: true })).traceFlags).toBe(1);
    expect(
      expectOk(createTraceContext({ parent, sampled: false })).traceFlags,
    ).toBe(0);
    expect(
      expectOk(createTraceContext({ parent: { ...parent, traceFlags: 0 } }))
        .traceFlags,
    ).toBe(0);
  });

  it("lets callers explicitly restart a trace when parsing fails", () => {
    const context = expectOk(
      parseTraceparent("invalid").orElse(() => createTraceContext()),
    );
    expect(context.parentSpanId).toBeUndefined();
    expect(
      expectOk(formatTraceparent(context).andThen(parseTraceparent)),
    ).toEqual(context);
  });

  it("composes parsing, child creation, and formatting with andThen", () => {
    const propagated = parseTraceparent(header)
      .andThen((parsed) => createTraceContext({ parent: parsed }))
      .andThen(formatTraceparent);
    const child = expectOk(propagated.andThen(parseTraceparent));
    expect(child.traceId).toBe(traceId);
    expect(child.spanId).not.toBe(spanId);
    expect(child.traceFlags).toBe(1);
    expectErr(
      parseTraceparent("invalid")
        .andThen((parsed) => createTraceContext({ parent: parsed }))
        .andThen(formatTraceparent),
    );
  });

  it("retries all-zero trace and span IDs", () => {
    vi.mocked(randomBytes)
      .mockImplementationOnce(() => Buffer.alloc(16))
      .mockImplementationOnce(() => Buffer.alloc(16, 1))
      .mockImplementationOnce(() => Buffer.alloc(8))
      .mockImplementationOnce(() => Buffer.alloc(8, 2));
    expect(expectOk(createTraceContext())).toMatchObject({
      traceId: "01".repeat(16),
      spanId: "02".repeat(8),
    });
  });

  it("returns a sanitized Err when generating root or child IDs fails", () => {
    for (const options of [{}, { parent }]) {
      vi.mocked(randomBytes).mockImplementationOnce(() => {
        throw new Error("private crypto failure");
      });
      const result = createTraceContext(options);
      expect(expectErr(result)).toMatchObject({
        status: 500,
        detail: "Unable to generate trace IDs",
      });
      expect(JSON.stringify(expectErr(result))).not.toContain(
        "private crypto failure",
      );
    }
  });

  it("correlates logs and outbound headers across isolated async scopes", async () => {
    const { logger, records } = createCapturingLogger();
    const contexts = [
      expectOk(createTraceContext({ parent })),
      expectOk(createTraceContext({ sampled: true })),
    ];
    await Promise.all(
      contexts.map((context) =>
        withLogContext({ ...context }, async () => {
          await Promise.resolve();
          logger.info({}, "distributed work");
          return formatTraceparent(context);
        }),
      ),
    );
    for (const context of contexts) {
      expect(records).toContainEqual(expect.objectContaining(context));
      const downstream = expectOk(
        formatTraceparent(context)
          .andThen(parseTraceparent)
          .andThen((parsed) => createTraceContext({ parent: parsed })),
      );
      expect(downstream.traceId).toBe(context.traceId);
      expect(downstream.parentSpanId).toBe(context.spanId);
    }
    assert.isEmpty(getLogContext());
  });
});
