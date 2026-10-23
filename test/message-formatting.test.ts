import fc from "fast-check";
import { assert, describe, expect, it } from "vitest";
import { createCapturingLogger } from "../src/testing";

describe("message formatting", () => {
  it("formats a string placeholder with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({ userId: "u-1" }, "Created user %s", "u-1");

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("Created user u-1");
    expect(record["userId"]).toBe("u-1");
  });

  it("formats a numeric placeholder with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "Count: %d", 42);

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("Count: 42");
  });

  it("formats a JSON placeholder with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "Object: %j", { foo: "bar" });

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe('Object: {"foo":"bar"}');
  });

  it.each(["fatal", "error", "warn", "info", "debug", "trace"] as const)(
    "supports extra arguments on the %s level method",
    (level) => {
      const { logger, records } = createCapturingLogger({
        env: { LOG_LEVEL: "trace" },
      });

      logger[level]({}, `${level} %s`, "value");

      expect(records.map((record) => record["msg"])).toEqual([
        `${level} value`,
      ]);
    },
  );

  it("substitutes any printable string, integer, or JSON value like %s, %d, and %j", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9 _-]{0,20}$/),
        fc.integer(),
        fc
          .jsonValue({ maxDepth: 2 })
          // pino's %j drops an own "__proto__" key and single-quotes top-level strings;
          // neither is behavior worth pinning here.
          .filter(
            (value) =>
              typeof value === "object" &&
              value !== null &&
              !JSON.stringify(value).includes("__proto__"),
          ),
        (text, count, json) => {
          const { logger, records } = createCapturingLogger();

          logger.info({}, "s=%s d=%d j=%j", text, count, json);

          expect(records[0]?.["msg"]).toBe(
            `s=${text} d=${count} j=${JSON.stringify(json)}`,
          );
        },
      ),
    );
  });

  it("supports message-only calls with extra arguments", () => {
    const { logger, records } = createCapturingLogger();

    logger.info("Hello %s", "world");

    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("Hello world");
  });
});
