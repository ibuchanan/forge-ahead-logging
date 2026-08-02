import { describe, expect, it, vi } from "vitest";
import { withLogContext } from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("withLogContext", () => {
  it("merges ambient bindings into records emitted inside the scope", () => {
    const { logger, records } = createCapturingLogger();

    withLogContext({ requestId: "req-1" }, () => {
      logger.info({}, "inside scope");
    });

    const [record] = records;
    expect(record.requestId).toBe("req-1");
    expect(record.msg).toBe("inside scope");
  });

  it("does not merge ambient bindings outside the scope", () => {
    const { logger, records } = createCapturingLogger();

    logger.info({}, "before scope");
    withLogContext({ requestId: "req-1" }, () => {
      logger.info({}, "inside scope");
    });
    logger.info({}, "after scope");

    expect(records[0].requestId).toBeUndefined();
    expect(records[1].requestId).toBe("req-1");
    expect(records[2].requestId).toBeUndefined();
  });

  it("lets explicit per-call metadata win over ambient bindings", () => {
    const { logger, records } = createCapturingLogger();

    withLogContext({ requestId: "req-1" }, () => {
      logger.info({ requestId: "req-2" }, "explicit wins");
    });

    const [record] = records;
    expect(record.requestId).toBe("req-2");
  });

  it("lets child bindings win over ambient bindings", () => {
    const { logger, records } = createCapturingLogger();

    withLogContext({ requestId: "req-1" }, () => {
      const child = logger.child({ requestId: "req-2" });
      child.info({}, "child wins");
    });

    const [record] = records;
    expect(record.requestId).toBe("req-2");
  });

  it("redacts secret-shaped ambient keys", () => {
    const { logger, records } = createCapturingLogger();

    withLogContext({ token: "shh" }, () => {
      logger.info({}, "redacted ambient");
    });

    const [record] = records;
    expect(record.token).toBe("[redacted]");
  });

  it("isolates concurrent invocations", async () => {
    const { logger, records } = createCapturingLogger();
    const delays = [20, 10, 30];

    await Promise.all(
      ["req-a", "req-b", "req-c"].map((requestId, index) =>
        withLogContext({ requestId }, async () => {
          await new Promise((resolve) => setTimeout(resolve, delays[index]));
          logger.info({}, "concurrent");
        }),
      ),
    );

    const requestIds = records.map((record) => record.requestId);
    expect(requestIds).toContain("req-a");
    expect(requestIds).toContain("req-b");
    expect(requestIds).toContain("req-c");
    expect(new Set(requestIds).size).toBe(3);
  });

  it("nests scopes so inner bindings override outer bindings", () => {
    const { logger, records } = createCapturingLogger();

    withLogContext({ requestId: "outer", accountId: "acc-1" }, () => {
      withLogContext({ requestId: "inner" }, () => {
        logger.info({}, "nested");
      });
    });

    const [record] = records;
    expect(record.requestId).toBe("inner");
    expect(record.accountId).toBe("acc-1");
  });

  it("returns the result of a synchronous operation", () => {
    const result = withLogContext({ requestId: "req-1" }, () => 42);

    expect(result).toBe(42);
  });

  it("returns the result of an asynchronous operation", async () => {
    const result = await withLogContext({ requestId: "req-1" }, async () => {
      await Promise.resolve();
      return 42;
    });

    expect(result).toBe(42);
  });
});

describe("createForgeLogger with ambient context", () => {
  it("uses the default logger with ambient context", async () => {
    vi.resetModules();
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { log, withLogContext: withDefaultLogContext } = await import(
      "../src/index"
    );

    withDefaultLogContext({ requestId: "req-1" }, () => {
      log.info({}, "default logger with context");
    });

    const record = JSON.parse(spy.mock.calls[0][0] as string);
    expect(record.requestId).toBe("req-1");
    spy.mockRestore();
  });
});
