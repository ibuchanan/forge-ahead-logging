import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { createForgeLogger, logProbe } from "../src/index";
import { captureForgeLoggerOutput } from "./helpers/capture-forge-logger-output";

const { loggedRecords } = captureForgeLoggerOutput();

describe("logProbe", () => {
  it("returns the original sync value and logs debugProbe at debug by default", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    const returned = logProbe(logger, "answer", 42);

    expect(returned).toBe(42);
    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.debug);
    expect(record.debugProbe).toMatchObject({ label: "answer", value: 42 });
  });

  it("emits no records at the default info logger level", () => {
    const logger = createForgeLogger({ env: {} });

    const returned = logProbe(logger, "answer", 42);

    expect(returned).toBe(42);
    expect(loggedRecords()).toHaveLength(0);
  });

  it("supports level: trace", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "trace" } });

    logProbe(logger, "answer", 42, { level: "trace" });

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.trace);
  });

  it("fulfills with the original resolved value and logs after settling", async () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    const returned = await logProbe(logger, "fetch", Promise.resolve(42));

    expect(returned).toBe(42);
    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.debug);
    expect(record.debugProbe).toMatchObject({ label: "fetch", value: 42 });
  });

  it("logs a rejection at the requested probe level and rethrows it", async () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });
    const failure = new Error("network down");

    await expect(
      logProbe(logger, "fetch", Promise.reject(failure)),
    ).rejects.toBe(failure);

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.debug);
    expect(record.debugProbe).toMatchObject({
      label: "fetch",
      error: { detail: "network down" },
    });
  });

  it("logs a synchronously thrown probe thunk and rethrows it", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });
    const failure = new Error("boom");

    expect(() =>
      logProbe(logger, "compute", () => {
        throw failure;
      }),
    ).toThrow(failure);

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.debug);
    expect(record.debugProbe).toMatchObject({
      label: "compute",
      error: { detail: "boom" },
    });
  });

  it("nests summarized metadata under debugProbe.metadata", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    logProbe(logger, "answer", 42, { metadata: { requestId: "req-1" } });

    const [record] = loggedRecords();
    expect(record.debugProbe).toMatchObject({
      metadata: { requestId: "req-1" },
    });
  });

  it("does not invoke lazy metadata when the requested level is disabled", () => {
    const logger = createForgeLogger({ env: {} });
    const metadata = vi.fn(() => ({ expensive: true }));

    logProbe(logger, "answer", 42, { metadata });

    expect(metadata).not.toHaveBeenCalled();
    expect(loggedRecords()).toHaveLength(0);
  });

  it("invokes lazy metadata when the requested level is enabled", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });
    const metadata = vi.fn(() => ({ computed: true }));

    logProbe(logger, "answer", 42, { metadata });

    expect(metadata).toHaveBeenCalledOnce();
    const [record] = loggedRecords();
    expect(record.debugProbe).toMatchObject({
      metadata: { computed: true },
    });
  });

  it("still runs the probed thunk when the requested level is disabled", () => {
    const logger = createForgeLogger({ env: {} });
    const thunk = vi.fn(() => 42);

    const returned = logProbe(logger, "answer", thunk);

    expect(thunk).toHaveBeenCalledOnce();
    expect(returned).toBe(42);
    expect(loggedRecords()).toHaveLength(0);
  });

  it("redacts secret-shaped keys in probe value and metadata", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    logProbe(
      logger,
      "answer",
      { password: "shh" },
      { metadata: { token: "shh" } },
    );

    const [record] = loggedRecords();
    expect((record.debugProbe as Record<string, unknown>).value).toEqual({
      password: "[redacted]",
    });
    expect((record.debugProbe as Record<string, unknown>).metadata).toEqual({
      token: "[redacted]",
    });
  });
});

describe("logger.probe", () => {
  it("delegates to logProbe", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    const returned = logger.probe("answer", 42);

    expect(returned).toBe(42);
    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.debug);
    expect(record.debugProbe).toMatchObject({ label: "answer", value: 42 });
  });

  it("preserves child bindings in emitted probe records", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });
    const child = logger.child({ requestId: "req-123" });

    child.probe("answer", 42);

    const [record] = loggedRecords();
    expect(record.requestId).toBe("req-123");
    expect(record.debugProbe).toMatchObject({ label: "answer", value: 42 });
  });
});
