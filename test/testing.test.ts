import { describe, expect, it } from "vitest";
import { createCapturingLogger } from "../src/testing";
import packageJson from "../package.json";

describe("testing subpath", () => {
  it("is declared as a separate package.json export", () => {
    expect(packageJson.exports).toHaveProperty("./testing");
  });
});

describe("createCapturingLogger", () => {
  it("returns a logger and a captured records array", () => {
    const { logger, records } = createCapturingLogger();

    expect(logger).toBeDefined();
    expect(records).toEqual([]);

    logger.info({ foo: "bar" }, "hello");

    expect(records).toHaveLength(1);
    expect(records[0].msg).toBe("hello");
    expect(records[0].foo).toBe("bar");
  });

  it("redacts secret-shaped keys through the default redaction backstop", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({ token: "secret-value", safe: "visible" }, "sensitive");

    const [record] = records;
    expect(record.token).toBe("[redacted]");
    expect(record.safe).toBe("visible");
  });

  it("respects LOG_LEVEL gating so disabled records are not captured", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logger.debug({}, "quiet");

    expect(records).toHaveLength(0);
  });

  it("emits records when LOG_LEVEL is set to enable the level", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logger.debug({}, "loud");

    expect(records).toHaveLength(1);
    expect(records[0].msg).toBe("loud");
  });

  it("keeps records isolated between separate capturing loggers", () => {
    const one = createCapturingLogger();
    const two = createCapturingLogger();

    one.logger.info({}, "one");
    two.logger.info({}, "two");

    expect(one.records).toHaveLength(1);
    expect(two.records).toHaveLength(1);
    expect(one.records[0].msg).toBe("one");
    expect(two.records[0].msg).toBe("two");
  });

  it("is not exported from the root package entry point", async () => {
    const rootExports = await import("../src/index");

    expect(
      (rootExports as Record<string, unknown>).createCapturingLogger,
    ).toBeUndefined();
  });
});
