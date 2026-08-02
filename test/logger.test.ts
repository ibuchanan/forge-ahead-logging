import { describe, expect, it, vi } from "vitest";
import { createForgeLogger, unwrapPinoLogger } from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("createForgeLogger", () => {
  it("logs object-first metadata and a message", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({ foo: "bar" }, "hello");

    const [record] = records;
    expect(record.msg).toBe("hello");
    expect(record.foo).toBe("bar");
    expect(record.level).toBe("info");
  });

  it("suppresses debug records at the default info level", () => {
    const { logger, records } = createCapturingLogger();

    logger.debug({}, "should not appear");

    expect(records).toHaveLength(0);
  });

  it("emits debug records when LOG_LEVEL=debug", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logger.debug({}, "now it appears");

    const [record] = records;
    expect(record.msg).toBe("now it appears");
    expect(record.level).toBe("debug");
  });

  it("includes the logger name when supplied", () => {
    const { logger, records } = createCapturingLogger({ name: "my-service" });

    logger.info({}, "hello");

    const [record] = records;
    expect(record.name).toBe("my-service");
  });

  it("suppresses default pino base fields unless base is supplied", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "hello");

    const [record] = records;
    expect(record.pid).toBeUndefined();
    expect(record.hostname).toBeUndefined();
  });

  it("includes caller-supplied base fields", () => {
    const { logger, records } = createCapturingLogger({
      base: { region: "us-east-1" },
    });

    logger.info({}, "hello");

    const [record] = records;
    expect(record.region).toBe("us-east-1");
  });

  it("passes child bindings through to emitted records", () => {
    const { logger, records } = createCapturingLogger();
    const child = logger.child({ requestId: "req-123" });

    child.info({}, "hello from child");

    const [record] = records;
    expect(record.requestId).toBe("req-123");
  });

  it("dispatches each record to the console method matching its severity, since forge logs reads console.* rather than raw fd writes", () => {
    const consoleSpies = ["error", "warn", "info", "debug"] as const;
    const spies = consoleSpies.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    logger.error({}, "an error");
    logger.warn({}, "a warning");
    logger.info({}, "some info");
    logger.debug({}, "some debug");

    spies.forEach((spy) => {
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  it("unwraps to the live underlying pino logger", () => {
    const { logger, records } = createCapturingLogger({
      name: "unwrapped-service",
    });

    unwrapPinoLogger(logger).info({ foo: "bar" }, "hello from pino directly");

    const [record] = records;
    expect(record.msg).toBe("hello from pino directly");
    expect(record.foo).toBe("bar");
    expect(record.name).toBe("unwrapped-service");
  });
});
