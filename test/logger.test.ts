import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createForgeLogger, unwrapPinoLogger } from "../src/index";

let writtenLines: string[];

beforeEach(() => {
  writtenLines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writtenLines.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedRecords(): Record<string, unknown>[] {
  return writtenLines.map((line) => JSON.parse(line));
}

describe("createForgeLogger", () => {
  it("logs object-first metadata and a message", () => {
    const logger = createForgeLogger({ env: {} });

    logger.info({ foo: "bar" }, "hello");

    const [record] = loggedRecords();
    expect(record.msg).toBe("hello");
    expect(record.foo).toBe("bar");
    expect(record.level).toBe(pino.levels.values.info);
  });

  it("suppresses debug records at the default info level", () => {
    const logger = createForgeLogger({ env: {} });

    logger.debug({}, "should not appear");

    expect(loggedRecords()).toHaveLength(0);
  });

  it("emits debug records when LOG_LEVEL=debug", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    logger.debug({}, "now it appears");

    const [record] = loggedRecords();
    expect(record.msg).toBe("now it appears");
    expect(record.level).toBe(pino.levels.values.debug);
  });

  it("includes the logger name when supplied", () => {
    const logger = createForgeLogger({ env: {}, name: "my-service" });

    logger.info({}, "hello");

    const [record] = loggedRecords();
    expect(record.name).toBe("my-service");
  });

  it("suppresses default pino base fields unless base is supplied", () => {
    const logger = createForgeLogger({ env: {} });

    logger.info({}, "hello");

    const [record] = loggedRecords();
    expect(record.pid).toBeUndefined();
    expect(record.hostname).toBeUndefined();
  });

  it("includes caller-supplied base fields", () => {
    const logger = createForgeLogger({
      env: {},
      base: { region: "us-east-1" },
    });

    logger.info({}, "hello");

    const [record] = loggedRecords();
    expect(record.region).toBe("us-east-1");
  });

  it("passes child bindings through to emitted records", () => {
    const logger = createForgeLogger({ env: {} });
    const child = logger.child({ requestId: "req-123" });

    child.info({}, "hello from child");

    const [record] = loggedRecords();
    expect(record.requestId).toBe("req-123");
  });

  it("unwraps to the live underlying pino logger", () => {
    const logger = createForgeLogger({ env: {}, name: "unwrapped-service" });

    unwrapPinoLogger(logger).info({ foo: "bar" }, "hello from pino directly");

    const [record] = loggedRecords();
    expect(record.msg).toBe("hello from pino directly");
    expect(record.foo).toBe("bar");
    expect(record.name).toBe("unwrapped-service");
  });
});
