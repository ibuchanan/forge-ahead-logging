import { afterEach, assert, describe, expect, it } from "vitest";
import { installConsoleCapture } from "../src/index";
import { createCapturingLogger } from "../src/testing";

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

afterEach(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
});

describe("installConsoleCapture", () => {
  it("returns an uninstall function", () => {
    const { logger } = createCapturingLogger();

    const uninstall = installConsoleCapture(logger);

    expect(typeof uninstall).toBe("function");
    uninstall();
  });

  it("routes console.log to logger.info", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    console.log("hello from console");

    expect(records).toHaveLength(1);
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("hello from console");
    expect(records[0]["level"]).toBe("info");
  });

  it("routes console.error to logger.error", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    console.error("something went wrong");

    expect(records).toHaveLength(1);
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("something went wrong");
    expect(records[0]["level"]).toBe("error");
  });

  it("routes console.warn and console.info to the matching logger levels", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    console.warn("a warning");
    console.info("some info");

    expect(records).toHaveLength(2);
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("a warning");
    expect(records[0]["level"]).toBe("warn");
    assert.isDefined(records[1]);
    expect(records[1]["msg"]).toBe("some info");
    expect(records[1]["level"]).toBe("info");
  });

  it("reports console argument types without copying values or keys", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    console.log("sensitive", { token: "secret-value", safe: "visible" });

    expect(records).toHaveLength(1);
    const record = records[0];
    assert.isDefined(record);
    expect(record["msg"]).toBe("sensitive");
    expect(record["consoleArgs"]).toEqual({
      type: "array",
      items: 1,
      values: [
        {
          type: "object",
          keys: 2,
          values: [
            { type: "string", length: 12 },
            { type: "string", length: 7 },
          ],
        },
      ],
    });
    expect(JSON.stringify(record["consoleArgs"])).not.toMatch(
      /secret-value|visible|token|safe/,
    );
  });

  it("does not break the logger's own output after capture", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    logger.info({ userId: "u-123" }, "logger message");

    expect(records).toHaveLength(1);
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("logger message");
    expect(records[0]["userId"]).toBe("u-123");
  });

  it("uninstall restores original console methods and stops capturing", () => {
    const { logger, records } = createCapturingLogger();
    const originalLog = console.log;
    const uninstall = installConsoleCapture(logger);

    console.log("captured");
    expect(records).toHaveLength(1);

    uninstall();
    expect(console.log).toBe(originalLog);
    console.log("not captured");
    expect(records).toHaveLength(1);
  });
});
