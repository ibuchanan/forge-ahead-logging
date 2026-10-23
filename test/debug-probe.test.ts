import { assert, describe, expect, it, vi } from "vitest";
import { logProbe } from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("logProbe", () => {
  it("returns the original sync value and logs its type at debug by default", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    expect(logProbe(logger, "answer", 42)).toBe(42);
    expect(records[0]).toMatchObject({
      level: "debug",
      debugProbe: { label: "answer", value: { type: "number" } },
    });
  });

  it("emits no records at the default info logger level", () => {
    const { logger, records } = createCapturingLogger();
    expect(logProbe(logger, "answer", 42)).toBe(42);
    expect(records).toHaveLength(0);
  });

  it("supports level: trace", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "trace" },
    });
    logProbe(logger, "answer", 42, { level: "trace" });
    assert.isDefined(records[0]);
    expect(records[0]["level"]).toBe("trace");
  });

  it("fulfills with the original resolved value and logs after settling", async () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const pending = logProbe(logger, "fetch", Promise.resolve(42));
    expect(records).toHaveLength(0);
    await expect(pending).resolves.toBe(42);
    expect(records[0]).toMatchObject({
      level: "debug",
      debugProbe: { label: "fetch", value: { type: "number" } },
    });
  });

  it("logs a rejection at the requested probe level and rethrows it", async () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const failure = new Error("network down");
    await expect(
      logProbe(logger, "fetch", Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(records[0]).toMatchObject({
      level: "debug",
      debugProbe: {
        label: "fetch",
        error: { errorName: "Error", outcome: "failure" },
      },
    });
  });

  it("logs a synchronously thrown probe thunk and rethrows it", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const failure = new Error("boom");
    expect(() =>
      logProbe(logger, "compute", () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(records[0]).toMatchObject({
      level: "debug",
      debugProbe: {
        label: "compute",
        error: { errorName: "Error", outcome: "failure" },
      },
    });
  });

  it("nests structural metadata under debugProbe.metadata", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    logProbe(logger, "answer", 42, { metadata: { requestId: "req-1" } });
    assert.isDefined(records[0]);
    expect(records[0]["debugProbe"]).toMatchObject({
      metadata: {
        type: "object",
        keys: 1,
        values: [{ type: "string", length: 5 }],
      },
    });
  });

  it("does not invoke lazy metadata when the requested level is disabled", () => {
    const { logger, records } = createCapturingLogger();
    const metadata = vi.fn(() => ({ expensive: true }));
    logProbe(logger, "answer", 42, { metadata });
    expect(metadata).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  it("invokes lazy metadata when the requested level is enabled", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const metadata = vi.fn(() => ({ computed: true }));
    logProbe(logger, "answer", 42, { metadata });
    expect(metadata).toHaveBeenCalledOnce();
    assert.isDefined(records[0]);
    expect(records[0]["debugProbe"]).toMatchObject({
      metadata: { type: "object", keys: 1, values: [{ type: "boolean" }] },
    });
  });

  it("still runs the probed thunk when the requested level is disabled", () => {
    const { logger, records } = createCapturingLogger();
    const thunk = vi.fn(() => 42);
    expect(logProbe(logger, "answer", thunk)).toBe(42);
    expect(thunk).toHaveBeenCalledOnce();
    expect(records).toHaveLength(0);
  });

  it("omits even secret-shaped property names from probe value and metadata", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    logProbe(
      logger,
      "answer",
      { password: "shh" },
      { metadata: { token: "shh" } },
    );
    const expected = {
      type: "object",
      keys: 1,
      values: [{ type: "string", length: 3 }],
    };
    assert.isDefined(records[0]);
    expect(records[0]["debugProbe"]).toEqual({
      label: "answer",
      value: expected,
      metadata: expected,
    });
  });
});

describe("logger.probe", () => {
  it("delegates to logProbe", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    expect(logger.probe("answer", 42)).toBe(42);
    expect(records[0]).toMatchObject({
      level: "debug",
      debugProbe: { label: "answer", value: { type: "number" } },
    });
  });

  it("preserves child bindings in emitted probe records", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    logger.child({ requestId: "req-123" }).probe("answer", 42);
    expect(records[0]).toMatchObject({
      requestId: "req-123",
      debugProbe: { label: "answer", value: { type: "number" } },
    });
  });
});
