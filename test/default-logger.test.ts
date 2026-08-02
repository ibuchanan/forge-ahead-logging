import { describe, expect, it, vi } from "vitest";

describe("default logger", () => {
  it("is exported from the root package and logs a record", async () => {
    vi.resetModules();
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { log } = await import("../src/index");

    log.info({ foo: "bar" }, "hello");

    expect(spy).toHaveBeenCalledOnce();
    const record = JSON.parse(spy.mock.calls[0][0] as string);
    expect(record.msg).toBe("hello");
    expect(record.foo).toBe("bar");
    spy.mockRestore();
  });

  it("emits records indistinguishable from createForgeLogger with no options", async () => {
    vi.resetModules();
    const consoleRecords: Record<string, unknown>[] = [];
    const logSpy = vi
      .spyOn(console, "info")
      .mockImplementation((line: string) => {
        consoleRecords.push(JSON.parse(line));
      });
    const { log, createForgeLogger } = await import("../src/index");

    log.info({ foo: "bar" }, "default");
    const logger = createForgeLogger();
    logger.info({ foo: "bar" }, "explicit");

    const [defaultRecord, explicitRecord] = consoleRecords;
    expect(defaultRecord.level).toBe(explicitRecord.level);
    expect(defaultRecord.foo).toBe(explicitRecord.foo);
    expect(defaultRecord.msg).toBe("default");
    expect(explicitRecord.msg).toBe("explicit");
    logSpy.mockRestore();
  });

  it("resolves LOG_LEVEL on first use, not at import time", async () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    vi.resetModules();
    const { log } = await import("../src/index");
    process.env.LOG_LEVEL = "debug";
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});

    log.debug({}, "debug after import");

    expect(spy).toHaveBeenCalledOnce();
    process.env.LOG_LEVEL = originalLogLevel;
    spy.mockRestore();
  });
});
