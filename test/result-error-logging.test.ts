import { err, ok, type ProblemDetails } from "@forge-ahead/errors";
import { describe, expect, it } from "vitest";
import { logError, logResult } from "../src/index";
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
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      timestamp: problem.timestamp,
    });
  });

  it("normalizes a non-ProblemDetails Error and includes errorName", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const error = new TypeError("bad input");

    logResult(logger, err(error));

    const [record] = records;
    expect(record.status).toBe(500);
    expect(record.detail).toBe("bad input");
    expect(record.errorName).toBe("TypeError");
    expect(record.stack).toBeUndefined();
  });

  it("includes the stack trace only when effective level is debug or trace", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const error = new TypeError("bad input");

    logResult(logger, err(error));

    const [record] = records;
    expect(record.stack).toContain("TypeError: bad input");
    expect(record.stack).toContain("frames omitted");
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

describe("logError", () => {
  it("normalizes an unknown error and logs at error by default", () => {
    const { logger, records } = createCapturingLogger({ env: {} });

    logError(logger, "boom");

    const [record] = records;
    expect(record.level).toBe("error");
    expect(record.status).toBe(500);
    expect(record.detail).toBe("boom");
  });

  it("includes errorName for Error instances and gates the stack trace by effective level", () => {
    const { logger: infoLogger, records: infoRecords } = createCapturingLogger({
      env: {},
    });
    const { logger: debugLogger, records: debugRecords } =
      createCapturingLogger({ env: { LOG_LEVEL: "debug" } });
    const error = new RangeError("out of bounds");

    logError(infoLogger, error);
    logError(debugLogger, error);

    const [infoRecord] = infoRecords;
    const [debugRecord] = debugRecords;
    expect(infoRecord.errorName).toBe("RangeError");
    expect(infoRecord.stack).toBeUndefined();
    expect(debugRecord.errorName).toBe("RangeError");
    expect(debugRecord.stack).toContain("RangeError: out of bounds");
    expect(debugRecord.stack).toContain("frames omitted");
  });

  it("logs only approved fields for an existing ProblemDetails", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const problem: ProblemDetails = {
      type: "https://httpstatuses.io/403",
      title: "Forbidden",
      status: 403,
      detail: "no access",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    logError(logger, problem);

    const [record] = records;
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
    expect(record.status).toBe(500);
    expect(record.detail).toBe("boom");
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

    logError(logger, root);

    const [record] = records;
    const causes = record.causes as Array<Record<string, unknown>>;
    expect(causes).toHaveLength(3);
    expect(causes).toEqual([
      expect.objectContaining({ detail: "cause1", errorName: "Error" }),
      expect.objectContaining({ detail: "cause2", errorName: "Error" }),
      expect.objectContaining({ detail: "cause3", errorName: "Error" }),
    ]);
    expect(causes[0].status).toBe(500);
    expect(causes[0].title).toBe("Internal Server Error");
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
    expect(causes[0].detail).toBe("b");
    expect(causes[1].detail).toBe("a");
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
    expect(record.errors).toHaveLength(3);
    expect(record.errors).toEqual([
      expect.objectContaining({ detail: "one", errorName: "Error" }),
      expect.objectContaining({ detail: "two", errorName: "Error" }),
      expect.objectContaining({ detail: "three", errorName: "Error" }),
    ]);
  });
});

describe("bounded stack traces", () => {
  it("truncates a stack trace to a bounded frame count with a marker", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    function deepStack(depth: number): Error {
      if (depth <= 1) return new Error("deep");
      return deepStack(depth - 1);
    }
    const error = deepStack(20);

    logError(logger, error);

    const [record] = records;
    const lines = (record.stack as string).split("\n");
    const marker = lines.find((line) => line.includes("frames omitted"));
    expect(marker).toBeDefined();
    expect(lines.length).toBeLessThan(20);
  });
});
