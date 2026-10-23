import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { configureForgeLogger, log } from "../src/index";
import { createCapturingLogger } from "../src/testing";

afterEach(() => {
  configureForgeLogger({});
});

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("timestamp format", () => {
  it("uses epoch milliseconds by default", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "hello");

    const record = records[0];
    assert.isDefined(record);
    expect(typeof record["time"]).toBe("number");
  });

  it("emits ISO-8601 timestamps when timestamp: 'iso' is set", () => {
    const { logger, records } = createCapturingLogger({ timestamp: "iso" });

    logger.info({}, "hello");

    const record = records[0];
    assert.isDefined(record);
    expect(typeof record["time"]).toBe("string");
    expect(record["time"]).toMatch(ISO_8601_PATTERN);
  });

  it("configures the default logger with ISO-8601 timestamps", () => {
    configureForgeLogger({ timestamp: "iso" });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    log.info({}, "hello");

    assert.isDefined(spy.mock.calls[0]);
    const record = JSON.parse(spy.mock.calls[0][0] as string);
    expect(typeof record["time"]).toBe("string");
    expect(record["time"]).toMatch(ISO_8601_PATTERN);
    spy.mockRestore();
  });
});
