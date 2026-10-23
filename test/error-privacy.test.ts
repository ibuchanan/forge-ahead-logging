import { err } from "@forge-ahead/errors";
import { describe, expect, it } from "vitest";
import {
  defineLogObjectSummaryPolicy,
  logError,
  logProbe,
  logResult,
  withForgeInvocationLogging,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";
import { atEachLevel, expectNoneEscaped } from "./privacy-helpers";

const privateText =
  "synthetic-person@example.test Bearer synthetic-secret private customer comment";
const domainFailure = {
  code: "CONFLICT",
  message: privateText,
  unknownProperty: privateText,
};
const problemFailure = {
  type: "urn:problem:conflict",
  status: 409,
  title: privateText,
  detail: privateText,
  instance: `https://customer.example.test/${privateText}`,
  timestamp: privateText,
  unknownProperty: privateText,
};
const nativeFailure = Object.assign(new TypeError(privateText), {
  unknownProperty: privateText,
});
nativeFailure["stack"] =
  `${privateText}\n    at https://customer.example.test/${privateText}`;
const aggregateFailure = new AggregateError(
  [domainFailure, problemFailure, nativeFailure, privateText],
  privateText,
  { cause: nativeFailure },
);
const failureCases = [
  {
    name: "domain error",
    error: domainFailure,
    summary: { errorCode: "CONFLICT", outcome: "failure" },
  },
  {
    name: "coded Error",
    error: Object.assign(new Error(privateText), {
      code: "CONFLICT",
      unknownProperty: privateText,
    }),
    summary: { errorCode: "CONFLICT", outcome: "failure" },
  },
  {
    name: "Problem Details",
    error: problemFailure,
    summary: { type: "urn:problem:conflict", status: 409, outcome: "failure" },
  },
  {
    name: "native Error",
    error: nativeFailure,
    summary: { errorName: "TypeError", outcome: "failure" },
  },
  {
    name: "aggregate",
    error: aggregateFailure,
    summary: {
      errorName: "AggregateError",
      outcome: "failure",
      causes: [{ errorName: "TypeError", outcome: "failure" }],
      errors: [
        { errorCode: "CONFLICT", outcome: "failure" },
        { type: "urn:problem:conflict", status: 409, outcome: "failure" },
        { errorName: "TypeError", outcome: "failure" },
      ],
    },
  },
  { name: "string", error: privateText, summary: { outcome: "failure" } },
  {
    name: "unknown object",
    error: { unknownProperty: privateText, toString: () => privateText },
    summary: { outcome: "failure" },
  },
  { name: "null", error: null, summary: { outcome: "failure" } },
  { name: "undefined", error: undefined, summary: { outcome: "failure" } },
  {
    name: "symbol",
    error: Symbol(privateText),
    summary: { outcome: "failure" },
  },
  { name: "bigint", error: 123456789n, summary: { outcome: "failure" } },
];

function expectOriginalThrow(operation: () => unknown, error: unknown): void {
  try {
    operation();
    expect.fail("Expected the operation to throw");
  } catch (thrown) {
    expect(thrown).toBe(error);
  }
}

it.each(failureCases)(
  "minimizes $name consistently across public seams at every threshold",
  async ({ error, summary }) => {
    await atEachLevel(["info", "debug", "trace"] as const, async (level) => {
      const { logger, records } = createCapturingLogger({
        env: { LOG_LEVEL: level },
      });
      const result = err(error);
      logResult(logger, result);
      logger.result(result);
      logError(logger, error);
      logger.errorResult(error);
      expect(result.error).toBe(error);
      expect(withForgeInvocationLogging(logger, {}, () => result)).toBe(result);
      await expect(logger.invocation({}, async () => result)).resolves.toBe(
        result,
      );
      expectOriginalThrow(
        () =>
          withForgeInvocationLogging(logger, {}, () => {
            throw error;
          }),
        error,
      );
      await expect(
        logger.invocation({}, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expectOriginalThrow(
        () =>
          logProbe(
            logger,
            "operation",
            () => {
              throw error;
            },
            { level: "debug" },
          ),
        error,
      );
      await expect(
        logger.probe("operation", Promise.reject(error), {
          level: level === "trace" ? "trace" : "debug",
        }),
      ).rejects.toBe(error);

      const envelope = { level: "error", time: expect.any(Number) };
      expect(records.slice(0, 4)).toEqual(
        Array.from({ length: 4 }, () => ({ ...envelope, ...summary })),
      );
      expect(records.slice(4, 8)).toEqual(
        Array.from({ length: 4 }, () => ({
          ...envelope,
          ...summary,
          kind: "forgeEvent",
          outcome: "failure",
          durationMs: expect.any(Number),
          msg: "invocation completed",
        })),
      );
      if (level === "info") {
        expect(records).toHaveLength(8);
      } else {
        expect(records.slice(8)).toEqual([
          {
            level: "debug",
            time: expect.any(Number),
            debugProbe: { label: "operation", error: summary },
          },
          {
            level,
            time: expect.any(Number),
            debugProbe: { label: "operation", error: summary },
          },
        ]);
      }
      expectNoneEscaped(records, [
        "synthetic-person",
        "synthetic-secret",
        "private customer",
        "customer.example.test",
        "unknownProperty",
      ]);
    });
  },
);

describe("automatic error privacy", () => {
  it("preserves explicit status without inventing statuses for domain failures", () => {
    const { logger, records } = createCapturingLogger();
    logError(logger, new Error(privateText), { status: 503 });
    logError(logger, domainFailure, { status: 503 });
    logError(logger, problemFailure, { status: 503 });
    expect(
      records.map(({ time: _time, level: _level, ...metadata }) => metadata),
    ).toEqual([
      { errorName: "Error", status: 503, outcome: "failure" },
      { errorCode: "CONFLICT", outcome: "failure" },
      { type: "urn:problem:conflict", status: 409, outcome: "failure" },
    ]);
  });

  it("keeps existing result enrichment additive after a bounded explicit projection", () => {
    const { logger, records } = createCapturingLogger();
    const errorPolicy = defineLogObjectSummaryPolicy({
      kind: "retryEvidence",
      fields: {
        errorCode: "code",
        causeCode: "cause.code",
        attempts: "attempts",
        token: { path: "unexpectedValue", transform: "redact" },
        preview: "longValue",
      },
    });
    const error = {
      ...domainFailure,
      cause: { code: "BUSY", message: privateText },
      attempts: 2,
      unexpectedValue: privateText,
      longValue: "x".repeat(300),
    };
    logResult(logger, err(error), {
      errorPolicy,
      summarizeErr: (received) => {
        expect(received).toBe(error);
        return { operation: "sync", attempts: 3 };
      },
    });
    expect(records[0]).toEqual({
      level: "error",
      time: expect.any(Number),
      kind: "retryEvidence",
      errorCode: "CONFLICT",
      causeCode: "BUSY",
      attempts: 3,
      token: "[redacted]",
      preview: `${"x".repeat(240)}...[60 chars omitted]`,
      operation: "sync",
      outcome: "failure",
    });
  });

  it("projects cause chains on domain and Problem Details objects without inventing status", () => {
    const { logger, records } = createCapturingLogger();
    const cause = { code: "RETRY_LATER", message: privateText };
    logError(logger, { code: "BUSY", message: privateText, cause });
    logError(logger, { ...problemFailure, cause });
    expect(records[0]).toEqual({
      level: "error",
      time: expect.any(Number),
      errorCode: "BUSY",
      outcome: "failure",
      causes: [{ errorCode: "RETRY_LATER", outcome: "failure" }],
    });
    expect(records[1]).toEqual({
      level: "error",
      time: expect.any(Number),
      type: "urn:problem:conflict",
      status: 409,
      outcome: "failure",
      causes: [{ errorCode: "RETRY_LATER", outcome: "failure" }],
    });
  });

  it("retains controlled nested evidence on coded AggregateErrors without copying properties", () => {
    const { logger, records } = createCapturingLogger();
    const error = Object.assign(
      new AggregateError(
        [{ code: "UPSTREAM_BUSY", message: "private customer comment" }],
        "synthetic-person@example.test",
        { cause: { code: "RETRY_LATER", message: "Bearer synthetic-secret" } },
      ),
      { code: "BATCH_FAILED", unknownField: "private customer comment" },
    );

    logError(logger, error);

    expect(records[0]).toEqual({
      level: "error",
      time: expect.any(Number),
      errorCode: "BATCH_FAILED",
      outcome: "failure",
      causes: [{ errorCode: "RETRY_LATER", outcome: "failure" }],
      errors: [{ errorCode: "UPSTREAM_BUSY", outcome: "failure" }],
    });
  });

  it.each(["debug", "trace"] as const)(
    "uses replacement policies for thrown and rejected probes at %s",
    async (level) => {
      const { logger, records } = createCapturingLogger({
        env: { LOG_LEVEL: level },
      });
      const errorPolicy = defineLogObjectSummaryPolicy({
        kind: "retryEvidence",
        fields: { retryable: "retryable" },
      });
      const error = {
        code: "NOT_SELECTED",
        retryable: true,
        message: "private customer comment",
      };
      let thrown: unknown;
      try {
        logProbe(
          logger,
          "operation",
          () => {
            throw error;
          },
          { level, errorPolicy },
        );
      } catch (value) {
        thrown = value;
      }
      expect(thrown).toBe(error);
      await expect(
        logger.probe("operation", Promise.reject(error), {
          level,
          errorPolicy,
        }),
      ).rejects.toBe(error);

      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(record).toEqual({
          level,
          time: expect.any(Number),
          debugProbe: {
            label: "operation",
            error: {
              kind: "retryEvidence",
              retryable: true,
              outcome: "failure",
            },
          },
        });
      }
    },
  );

  it("uses replacement policies for returned, thrown, and rejected invocation failures without changing outcomes", async () => {
    const { logger, records } = createCapturingLogger();
    const errorPolicy = defineLogObjectSummaryPolicy({
      kind: "retryEvidence",
      fields: { retryable: "retryable" },
    });
    const error = {
      code: "NOT_SELECTED",
      retryable: true,
      message: "private customer comment",
    };
    const result = err(error);

    expect(
      withForgeInvocationLogging(logger, {}, () => result, { errorPolicy }),
    ).toBe(result);
    await expect(
      logger.invocation({}, async () => result, { errorPolicy }),
    ).resolves.toBe(result);
    let thrown: unknown;
    try {
      withForgeInvocationLogging(
        logger,
        {},
        () => {
          throw error;
        },
        { errorPolicy },
      );
    } catch (value) {
      thrown = value;
    }
    expect(thrown).toBe(error);
    await expect(
      logger.invocation(
        {},
        async () => {
          throw error;
        },
        { errorPolicy },
      ),
    ).rejects.toBe(error);

    expect(records).toHaveLength(4);
    for (const record of records) {
      expect(record).toEqual({
        level: "error",
        time: expect.any(Number),
        kind: "forgeEvent",
        retryable: true,
        outcome: "failure",
        durationMs: expect.any(Number),
        msg: "invocation completed",
      });
    }
  });

  it("uses replacement policies for standalone and logger error methods", () => {
    const { logger, records } = createCapturingLogger();
    const errorPolicy = defineLogObjectSummaryPolicy({
      kind: "retryEvidence",
      fields: { retryable: "retryable" },
    });
    const error = {
      code: "NOT_SELECTED",
      retryable: true,
      message: "private customer comment",
    };

    logError(logger, error, { errorPolicy, status: 503 });
    logger.errorResult(error, { errorPolicy });
    logger.result(err(error), { errorPolicy });

    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record).toEqual({
        level: "error",
        time: expect.any(Number),
        kind: "retryEvidence",
        retryable: true,
        outcome: "failure",
      });
    }
  });

  it("replaces automatic error fields with an explicit Object Summary Policy", () => {
    const { logger, records } = createCapturingLogger();
    const error = {
      code: "NOT_SELECTED",
      message: "private customer comment",
      retryable: true,
      attempt: 2,
      unexpectedEvidence: "synthetic-person@example.test",
      cause: new Error("Bearer synthetic-secret"),
    };
    const errorPolicy = defineLogObjectSummaryPolicy({
      kind: "retryEvidence",
      fields: { retryable: "retryable", attempt: "attempt" },
    });

    logResult(logger, err(error), { errorPolicy });

    expect(records[0]).toEqual({
      level: "error",
      time: expect.any(Number),
      kind: "retryEvidence",
      retryable: true,
      attempt: 2,
      outcome: "failure",
    });
  });

  it("uses the same minimal projection for bounded causes and aggregate members", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "trace" },
    });
    const cause = {
      code: "UPSTREAM_BUSY",
      message: "synthetic-person@example.test",
      cause: { code: "RETRY_LATER", unknownField: "Bearer synthetic-secret" },
    };
    const problem = {
      type: "urn:problem:throttled",
      status: 429,
      title: "private customer comment",
      detail: "synthetic-person@example.test",
    };
    const error = new AggregateError(
      [
        cause,
        problem,
        "Bearer synthetic-secret",
        new Error("fourth private error"),
      ],
      "private customer comment",
      { cause },
    );

    logError(logger, error);

    expect(records[0]).toEqual({
      level: "error",
      time: expect.any(Number),
      outcome: "failure",
      errorName: "AggregateError",
      causes: [
        { errorCode: "UPSTREAM_BUSY", outcome: "failure" },
        { errorCode: "RETRY_LATER", outcome: "failure" },
      ],
      errors: [
        { errorCode: "UPSTREAM_BUSY", outcome: "failure" },
        { type: "urn:problem:throttled", status: 429, outcome: "failure" },
        { outcome: "failure" },
      ],
    });
  });

  it.each(["info", "debug", "trace"])(
    "never stringifies unknown failures or retains stacks at %s",
    (level) => {
      const { logger, records } = createCapturingLogger({
        env: { LOG_LEVEL: level },
      });
      const error = new TypeError(
        "synthetic-person@example.test\n    at private customer comment",
      );
      error["stack"] =
        "TypeError: Bearer synthetic-secret\n    at https://customer.example.test/private";
      logError(logger, error);
      logError(logger, "Bearer synthetic-secret");
      logError(logger, { unexpectedEvidence: "private customer comment" });

      expect(records).toEqual([
        {
          level: "error",
          time: expect.any(Number),
          errorName: "TypeError",
          outcome: "failure",
        },
        { level: "error", time: expect.any(Number), outcome: "failure" },
        { level: "error", time: expect.any(Number), outcome: "failure" },
      ]);
    },
  );

  it("keeps only the controlled type, status, and failure outcome from Problem Details", () => {
    const { logger, records } = createCapturingLogger();
    logError(logger, {
      type: "urn:problem:invalid-request",
      status: 422,
      title: "synthetic-person@example.test",
      detail: "private customer comment",
      instance: "https://customer.example.test/private?token=synthetic-secret",
      timestamp: "customer-supplied-text",
      unexpectedEvidence: "Bearer synthetic-secret",
    });

    expect(records[0]).toEqual({
      level: "error",
      time: expect.any(Number),
      type: "urn:problem:invalid-request",
      status: 422,
      outcome: "failure",
    });
  });

  it("logs only a controlled domain code and failure outcome", () => {
    const { logger, records } = createCapturingLogger();
    const error = {
      code: "INVALID_REQUEST",
      message: "synthetic-person@example.test",
      unexpectedEvidence: "Bearer synthetic-secret",
      customerNote: "private customer comment",
      retryable: true,
    };
    const result = err(error);

    logResult(logger, result);

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      level: "error",
      time: expect.any(Number),
      errorCode: "INVALID_REQUEST",
      outcome: "failure",
    });
    expect(result.error).toBe(error);
  });
});
