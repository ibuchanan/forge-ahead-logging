import { describe, expect, it } from "vitest";
import { createCapturingLogger } from "../src/testing";

describe("message formatting", () => {
  it("formats a string placeholder with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({ userId: "u-1" }, "Created user %s", "u-1");

    const [record] = records;
    expect(record.msg).toBe("Created user u-1");
    expect(record.userId).toBe("u-1");
  });

  it("formats a numeric placeholder with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "Count: %d", 42);

    const [record] = records;
    expect(record.msg).toBe("Count: 42");
  });

  it("formats a JSON placeholder with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "Object: %j", { foo: "bar" });

    const [record] = records;
    expect(record.msg).toBe('Object: {"foo":"bar"}');
  });

  it("supports extra arguments on all seven level methods", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "trace" },
    });

    logger.fatal({}, "fatal %s", "one");
    logger.error({}, "error %s", "two");
    logger.warn({}, "warn %s", "three");
    logger.info({}, "info %s", "four");
    logger.debug({}, "debug %s", "five");
    logger.trace({}, "trace %s", "six");

    expect(records).toHaveLength(6);
    expect(records[0].msg).toBe("fatal one");
    expect(records[1].msg).toBe("error two");
    expect(records[2].msg).toBe("warn three");
    expect(records[3].msg).toBe("info four");
    expect(records[4].msg).toBe("debug five");
    expect(records[5].msg).toBe("trace six");
  });

  it("supports message-only calls with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info("Hello %s", "world");

    const [record] = records;
    expect(record.msg).toBe("Hello world");
  });
});
