import { err, ok, type ProblemDetails } from "@forge-ahead/errors";
import { describe, expect, it } from "vitest";
import {
  type ForgeLogger,
  logError,
  logResult,
  type MinimalLogger,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("logResult", () => {
  it("logs Ok results at debug by default with only a generic success marker", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logResult(logger, ok({ id: 1, secret: "shh" }));

    const [record] = records;
    expect(record.level).toBe("debug");
    expect(record.ok).toBe(true);
    expect(record.id).toBeUndefined();
    expect(record.secret).toBeUndefined();
  });

  it("merges summarizeOk metadata alongside the generic success marker", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logResult(logger, ok({ id: 1, secret: "shh" }), {
      summarizeOk: (value) => ({ id: value.id }),
    });

    const [record] = records;
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
    const { logger, records } = createCapturingLogger({ env: {} });

    logResult(logger, err(problem));

    const [record] = records;
    expect(record.level).toBe("error");
    expect(record).toMatchObject({
      type: problem.type,
      status: problem.status,
      outcome: "failure",
    });
    expect(record.title).toBeUndefined();
    expect(record.detail).toBeUndefined();
    expect(record.timestamp).toBeUndefined();
  });

  it("normalizes a non-ProblemDetails Error and includes errorName", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const error = new TypeError("bad input");

    logResult(logger, err(error));

    const [record] = records;
    expect(record.status).toBeUndefined();
    expect(record.detail).toBeUndefined();
    expect(record.errorName).toBe("TypeError");
    expect(record.outcome).toBe("failure");
    expect(record.stack).toBeUndefined();
  });

  it("merges summarizeErr metadata alongside approved ProblemDetails fields", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logResult(logger, err(problem), {
      summarizeErr: () => ({ retryable: true }),
    });

    const [record] = records;
    expect(record.retryable).toBe(true);
    expect(record.status).toBe(404);
  });
});

describe("logResult domain errors", () => {
  it("logs a { code: string } error with errorCode instead of a synthesized 500", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logResult(logger, err({ code: "invalid-seed-request" }));

    const [record] = records;
    expect(record.level).toBe("error");
    expect(record.errorCode).toBe("invalid-seed-request");
    expect(record.status).toBeUndefined();
    expect(record.type).toBeUndefined();
  });

  it("does not treat a numeric code as a domain error", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logResult(logger, err({ code: 409 }));

    const [record] = records;
    expect(record.status).toBeUndefined();
    expect(record.errorCode).toBeUndefined();
    expect(record.outcome).toBe("failure");
  });

  it("does not treat a string error as a domain error", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logResult(logger, err("boom"));

    const [record] = records;
    expect(record.status).toBeUndefined();
    expect(record.errorCode).toBeUndefined();
    expect(record.outcome).toBe("failure");
  });

  it("merges summarizeErr metadata alongside domain error fields", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logResult(logger, err({ code: "invalid-seed-request" }), {
      summarizeErr: () => ({ event: "seed.failed", role: "admin" }),
    });

    const [record] = records;
    expect(record.errorCode).toBe("invalid-seed-request");
    expect(record.event).toBe("seed.failed");
    expect(record.role).toBe("admin");
  });
});

describe("MinimalLogger type assertion", () => {
  it("is satisfied by ForgeLogger", () => {
    const _typeCheck: MinimalLogger = {} as ForgeLogger;
    expect(_typeCheck).toBeDefined();
  });
});

describe("logError", () => {
  it("normalizes an unknown error and logs at error by default", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logError(logger, "boom");

    const [record] = records;
    expect(record.level).toBe("error");
    expect(record.status).toBeUndefined();
    expect(record.detail).toBeUndefined();
    expect(record.outcome).toBe("failure");
  });
});

describe("logger.result and logger.errorResult", () => {
  it("logger.result delegates to logResult", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });

    logger.result(ok({ id: 1 }));

    const [record] = records;
    expect(record.level).toBe("debug");
    expect(record.ok).toBe(true);
  });

  it("logger.errorResult delegates to logError", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logger.errorResult("boom");

    const [record] = records;
    expect(record.level).toBe("error");
    expect(record.status).toBeUndefined();
    expect(record.detail).toBeUndefined();
    expect(record.outcome).toBe("failure");
  });
});

describe("bounded error cause chains", () => {
  it("logs up to three bounded cause links", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const root = new Error("root");
    const cause1 = new Error("cause1");
    const cause2 = new Error("cause2");
    const cause3 = new Error("cause3");
    root.cause = cause1;
    cause1.cause = cause2;
    cause2.cause = cause3;
    cause3.cause = new Error("fourth cause must be omitted");

    logError(logger, root);

    const [record] = records;
    const causes = record.causes as Array<Record<string, unknown>>;
    expect(causes).toHaveLength(3);
    expect(causes).toEqual([
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
    ]);
    expect(causes[0].detail).toBeUndefined();
    expect(causes[0].status).toBeUndefined();
    expect(causes[0].title).toBeUndefined();
  });

  it("stops before a cyclic cause chain", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const a = new Error("a");
    const b = new Error("b");
    a.cause = b;
    b.cause = a;

    logError(logger, a);

    const [record] = records;
    const causes = record.causes as Array<Record<string, unknown>>;
    expect(causes).toHaveLength(2);
    expect(causes[0]).toEqual(
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
    );
    expect(causes[1]).toEqual(
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
    );
    expect(causes[0].detail).toBeUndefined();
    expect(causes[1].detail).toBeUndefined();
  });
});

describe("AggregateError summary", () => {
  it("summarizes AggregateError.errors as a bounded array of normalized records", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const aggregate = new AggregateError(
      [
        new Error("one"),
        new Error("two"),
        new Error("three"),
        new Error("four"),
      ],
      "multiple failures",
    );

    logError(logger, aggregate);

    const [record] = records;
    expect(record.errorName).toBe("AggregateError");
    expect(record.outcome).toBe("failure");
    expect(record.errors).toHaveLength(3);
    expect(record.errors).toEqual([
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
      expect.objectContaining({ errorName: "Error", outcome: "failure" }),
    ]);
    expect(
      (record.errors as Array<Record<string, unknown>>)[0].detail,
    ).toBeUndefined();
  });
});
