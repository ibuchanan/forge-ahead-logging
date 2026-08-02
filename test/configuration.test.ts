import { describe, expect, it, vi } from "vitest";
import {
  configureForgeLogger,
  log,
  unwrapPinoLogger,
  withLogContext,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("configureForgeLogger", () => {
  it("updates the default singleton logger", () => {
    configureForgeLogger({ name: "configured-default" });

    const defaultPino = unwrapPinoLogger(log);
    expect(defaultPino.bindings().name).toBe("configured-default");
  });

  it("does not affect custom createForgeLogger instances", () => {
    const { logger } = createCapturingLogger();

    configureForgeLogger({ name: "configured-default" });

    const customPino = unwrapPinoLogger(logger);
    expect(customPino.bindings().name).toBeUndefined();
  });
});

describe("recordMetadata", () => {
  it("merges per-record metadata into emitted records", () => {
    const { logger, records } = createCapturingLogger({
      recordMetadata: () => ({ traceId: "trace-123" }),
    });

    logger.info({ userId: "u-1" }, "hello");

    const [record] = records;
    expect(record.traceId).toBe("trace-123");
    expect(record.userId).toBe("u-1");
  });

  it("does not invoke the callback when the level is disabled", () => {
    const callback = vi.fn(() => ({ traceId: "trace-123" }));
    const { logger } = createCapturingLogger({
      env: { LOG_LEVEL: "info" },
      recordMetadata: callback,
    });

    logger.debug({}, "quiet");

    expect(callback).not.toHaveBeenCalled();
  });

  it("invokes the callback when the level is enabled", () => {
    const callback = vi.fn(() => ({ traceId: "trace-123" }));
    const { logger } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
      recordMetadata: callback,
    });

    logger.debug({}, "loud");

    expect(callback).toHaveBeenCalledOnce();
  });

  it("summarizes and redacts callback output", () => {
    const { logger, records } = createCapturingLogger({
      recordMetadata: () => ({ token: "secret-value", safe: "visible" }),
    });

    logger.info({}, "hello");

    const [record] = records;
    expect(record.token).toBe("[redacted]");
    expect(record.safe).toBe("visible");
  });

  it("does not throw when the callback throws; it emits a fallback record", () => {
    const { logger, records } = createCapturingLogger({
      recordMetadata: () => {
        throw new Error("metadata boom");
      },
    });

    logger.info({ userId: "u-1" }, "hello");

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.msg).toBe("hello");
    expect(record.userId).toBe("u-1");
    expect(record.recordMetadataError).toBe(true);
  });

  it("merges with precedence: explicit > ambient > recordMetadata > base", () => {
    const { logger, records } = createCapturingLogger({
      base: { requestId: "base" },
      recordMetadata: () => ({ requestId: "record" }),
    });

    withLogContext({ requestId: "ambient" }, () => {
      logger.info({ requestId: "explicit" }, "hello");
    });

    const [record] = records;
    expect(record.requestId).toBe("explicit");
  });

  it("gives ambient context precedence over recordMetadata and base", () => {
    const { logger, records } = createCapturingLogger({
      base: { requestId: "base" },
      recordMetadata: () => ({ requestId: "record" }),
    });

    withLogContext({ requestId: "ambient" }, () => {
      logger.info({}, "hello");
    });

    const [record] = records;
    expect(record.requestId).toBe("ambient");
  });

  it("gives recordMetadata precedence over base", () => {
    const { logger, records } = createCapturingLogger({
      base: { requestId: "base" },
      recordMetadata: () => ({ requestId: "record" }),
    });

    logger.info({}, "hello");

    const [record] = records;
    expect(record.requestId).toBe("record");
  });
});
