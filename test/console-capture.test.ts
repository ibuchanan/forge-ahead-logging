import { afterEach, describe, expect, it } from "vitest";
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
    expect(records[0].msg).toBe("hello from console");
    expect(records[0].level).toBe("info");
  });

  it("routes console.error to logger.error", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    console.error("something went wrong");

    expect(records).toHaveLength(1);
    expect(records[0].msg).toBe("something went wrong");
    expect(records[0].level).toBe("error");
  });

  it("routes console.warn and console.info to the matching logger levels", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    console.warn("a warning");
    console.info("some info");

    expect(records).toHaveLength(2);
    expect(records[0].msg).toBe("a warning");
    expect(records[0].level).toBe("warn");
    expect(records[1].msg).toBe("some info");
    expect(records[1].level).toBe("info");
  });

  it("summarizes and redacts console arguments through the Forge logger", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    console.log("sensitive", { token: "secret-value", safe: "visible" });

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.msg).toBe("sensitive");
    const consoleArgs = record.consoleArgs as Record<string, unknown>[];
    expect(consoleArgs).toHaveLength(1);
    expect(consoleArgs[0].token).toBe("[redacted]");
    expect(consoleArgs[0].safe).toBe("visible");
  });

  it("does not break the logger's own output after capture", () => {
    const { logger, records } = createCapturingLogger();
    installConsoleCapture(logger);

    logger.info({ userId: "u-123" }, "logger message");

    expect(records).toHaveLength(1);
    expect(records[0].msg).toBe("logger message");
    expect(records[0].userId).toBe("u-123");
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
