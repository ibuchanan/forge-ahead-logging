import { err, ok, type ProblemDetails } from "@forge-ahead/errors";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createForgeLogger, logError, logResult } from "../src/index";
import { captureForgeLoggerOutput } from "./helpers/capture-forge-logger-output";

const { loggedRecords } = captureForgeLoggerOutput();

describe("logResult", () => {
  it("logs Ok results at debug by default with only a generic success marker", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    logResult(logger, ok({ id: 1, secret: "shh" }));

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.debug);
    expect(record.ok).toBe(true);
    expect(record.id).toBeUndefined();
    expect(record.secret).toBeUndefined();
  });

  it("merges summarizeOk metadata alongside the generic success marker", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    logResult(logger, ok({ id: 1, secret: "shh" }), {
      summarizeOk: (value) => ({ id: value.id }),
    });

    const [record] = loggedRecords();
    expect(record.ok).toBe(true);
    expect(record.id).toBe(1);
    expect(record.secret).toBeUndefined();
  });
});

describe("logResult err branch", () => {
  const problem: ProblemDetails = {
    type: "https://httpstatuses.io/404",
    title: "Not Found",
    status: 404,
    detail: "missing",
    timestamp: "2024-01-01T00:00:00.000Z",
  };

  it("logs Err results at error by default with only approved ProblemDetails fields", () => {
    const logger = createForgeLogger({ env: {} });

    logResult(logger, err(problem));

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.error);
    expect(record).toMatchObject({
      type: problem.type,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      timestamp: problem.timestamp,
    });
  });

  it("normalizes a non-ProblemDetails Error and includes errorName", () => {
    const logger = createForgeLogger({ env: {} });
    const error = new TypeError("bad input");

    logResult(logger, err(error));

    const [record] = loggedRecords();
    expect(record.status).toBe(500);
    expect(record.detail).toBe("bad input");
    expect(record.errorName).toBe("TypeError");
    expect(record.stack).toBeUndefined();
  });

  it("includes the stack trace only when effective level is debug or trace", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });
    const error = new TypeError("bad input");

    logResult(logger, err(error));

    const [record] = loggedRecords();
    expect(record.stack).toBe(error.stack);
  });

  it("merges summarizeErr metadata alongside approved ProblemDetails fields", () => {
    const logger = createForgeLogger({ env: {} });

    logResult(logger, err(problem), {
      summarizeErr: () => ({ retryable: true }),
    });

    const [record] = loggedRecords();
    expect(record.retryable).toBe(true);
    expect(record.status).toBe(404);
  });
});

describe("logError", () => {
  it("normalizes an unknown error and logs at error by default", () => {
    const logger = createForgeLogger({ env: {} });

    logError(logger, "boom");

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.error);
    expect(record.status).toBe(500);
    expect(record.detail).toBe("boom");
  });

  it("includes errorName for Error instances and gates the stack trace by effective level", () => {
    const infoLogger = createForgeLogger({ env: {} });
    const debugLogger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });
    const error = new RangeError("out of bounds");

    logError(infoLogger, error);
    logError(debugLogger, error);

    const [infoRecord, debugRecord] = loggedRecords();
    expect(infoRecord.errorName).toBe("RangeError");
    expect(infoRecord.stack).toBeUndefined();
    expect(debugRecord.errorName).toBe("RangeError");
    expect(debugRecord.stack).toBe(error.stack);
  });

  it("logs only approved fields for an existing ProblemDetails", () => {
    const logger = createForgeLogger({ env: {} });
    const problem: ProblemDetails = {
      type: "https://httpstatuses.io/403",
      title: "Forbidden",
      status: 403,
      detail: "no access",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    logError(logger, problem);

    const [record] = loggedRecords();
    expect(record).toMatchObject({
      type: problem.type,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      timestamp: problem.timestamp,
    });
    expect(record.errorName).toBeUndefined();
  });
});

describe("logger.result and logger.errorResult", () => {
  it("logger.result delegates to logResult", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });

    logger.result(ok({ id: 1 }));

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.debug);
    expect(record.ok).toBe(true);
  });

  it("logger.errorResult delegates to logError", () => {
    const logger = createForgeLogger({ env: {} });

    logger.errorResult("boom");

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.error);
    expect(record.status).toBe(500);
    expect(record.detail).toBe("boom");
  });
});
