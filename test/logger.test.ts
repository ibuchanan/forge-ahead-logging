import { assert, describe, expect, it, vi } from "vitest";
import { createForgeLogger, unwrapPinoLogger } from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("createForgeLogger", () => {
  it("logs object-first metadata and a message", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({ foo: "bar" }, "hello");

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("hello");
    expect(record["foo"]).toBe("bar");
    expect(record["level"]).toBe("info");
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

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("now it appears");
    expect(record["level"]).toBe("debug");
  });

  it("includes the logger name when supplied", () => {
    const { logger, records } = createCapturingLogger({ name: "my-service" });

    logger.info({}, "hello");

    const record = records[0];
    assert.isDefined(record);
    expect(record["name"]).toBe("my-service");
  });

  it("suppresses default pino base fields unless base is supplied", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "hello");

    const record = records[0];
    assert.isDefined(record);
    expect(record["pid"]).toBeUndefined();
    expect(record["hostname"]).toBeUndefined();
  });

  it("includes caller-supplied base fields", () => {
    const { logger, records } = createCapturingLogger({
      base: { region: "us-east-1" },
    });

    logger.info({}, "hello");

    const record = records[0];
    assert.isDefined(record);
    expect(record["region"]).toBe("us-east-1");
  });

  it("passes child bindings through to emitted records", () => {
    const { logger, records } = createCapturingLogger();
    const child = logger.child({ requestId: "req-123" });

    child.info({}, "hello from child");

    const record = records[0];
    assert.isDefined(record);
    expect(record["requestId"]).toBe("req-123");
  });

  it("applies per-name LOG_LEVEL overrides to the named logger", () => {
    const { logger, records } = createCapturingLogger({
      name: "my-lib",
      env: { LOG_LEVEL: "info,my-lib=debug" },
    });

    logger.debug({}, "debug for my-lib");

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("debug for my-lib");
    expect(record["level"]).toBe("debug");
  });

  it("lets child loggers inherit a per-name LOG_LEVEL override", () => {
    const { logger, records } = createCapturingLogger({
      name: "my-lib",
      env: { LOG_LEVEL: "info,my-lib=debug" },
    });
    const child = logger.child({ requestId: "req-123" });

    child.debug({}, "debug from child");

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("debug from child");
    expect(record["level"]).toBe("debug");
  });

  it("accepts a message-only call equivalent to an empty metadata object", () => {
    const { logger, records } = createCapturingLogger();

    logger.info("hello");

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("hello");
    expect(record["level"]).toBe("info");
  });

  it("keeps the explicit message when metadata also contains a msg key", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({ msg: "from object", foo: "bar" }, "from argument");

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("from argument");
    expect(record["foo"]).toBe("bar");
  });

  it("supports message-only calls on all seven level methods", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "trace" },
    });

    logger.fatal("fatal msg");
    logger.error("error msg");
    logger.warn("warn msg");
    logger.info("info msg");
    logger.debug("debug msg");
    logger.trace("trace msg");

    expect(records).toHaveLength(6);
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("fatal msg");
    assert.isDefined(records[0]);
    expect(records[0]["level"]).toBe("fatal");
    assert.isDefined(records[1]);
    expect(records[1]["msg"]).toBe("error msg");
    assert.isDefined(records[1]);
    expect(records[1]["level"]).toBe("error");
    assert.isDefined(records[2]);
    expect(records[2]["msg"]).toBe("warn msg");
    assert.isDefined(records[2]);
    expect(records[2]["level"]).toBe("warn");
    assert.isDefined(records[3]);
    expect(records[3]["msg"]).toBe("info msg");
    assert.isDefined(records[3]);
    expect(records[3]["level"]).toBe("info");
    assert.isDefined(records[4]);
    expect(records[4]["msg"]).toBe("debug msg");
    assert.isDefined(records[4]);
    expect(records[4]["level"]).toBe("debug");
    assert.isDefined(records[5]);
    expect(records[5]["msg"]).toBe("trace msg");
    assert.isDefined(records[5]);
    expect(records[5]["level"]).toBe("trace");
  });

  it("does not invoke a metadata thunk when the level is disabled", () => {
    const { logger, records } = createCapturingLogger();
    const thunk = vi.fn(() => ({ expensive: true }));

    logger.debug(thunk, "quiet");

    expect(thunk).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  it("invokes a metadata thunk and emits the result when the level is enabled", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logger.debug(() => ({ expensive: true }), "loud");

    expect(records).toHaveLength(1);
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("loud");
    assert.isDefined(records[0]);
    expect(records[0]["expensive"]).toBe(true);
  });

  it("exposes isLevelEnabled for all seven levels", () => {
    const { logger } = createCapturingLogger({ env: { LOG_LEVEL: "info" } });

    expect(logger.isLevelEnabled("fatal")).toBe(true);
    expect(logger.isLevelEnabled("error")).toBe(true);
    expect(logger.isLevelEnabled("warn")).toBe(true);
    expect(logger.isLevelEnabled("info")).toBe(true);
    expect(logger.isLevelEnabled("debug")).toBe(false);
    expect(logger.isLevelEnabled("trace")).toBe(false);
    expect(logger.isLevelEnabled("silent")).toBe(true);
  });

  it("propagates a metadata thunk that throws", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const failure = new Error("thunk boom");

    expect(() =>
      logger.debug(() => {
        throw failure;
      }, "never"),
    ).toThrow(failure);

    expect(records).toHaveLength(0);
  });

  it("logs through a dynamic level method", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logger.log("info", { foo: "bar" }, "dynamic info");
    logger.log("debug", { foo: "bar" }, "dynamic debug");

    expect(records).toHaveLength(2);
    assert.isDefined(records[0]);
    expect(records[0]["level"]).toBe("info");
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("dynamic info");
    assert.isDefined(records[1]);
    expect(records[1]["level"]).toBe("debug");
    assert.isDefined(records[1]);
    expect(records[1]["msg"]).toBe("dynamic debug");
  });

  it("does not emit when the dynamic level is disabled", () => {
    const { logger, records } = createCapturingLogger();

    logger.log("debug", { foo: "bar" }, "dynamic debug");

    expect(records).toHaveLength(0);
  });

  it("does not emit for invalid dynamic levels", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logger.log("invalid" as "info", { foo: "bar" }, "invalid");

    expect(records).toHaveLength(0);
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

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("hello from pino directly");
    expect(record["foo"]).toBe("bar");
    expect(record["name"]).toBe("unwrapped-service");
  });
});
