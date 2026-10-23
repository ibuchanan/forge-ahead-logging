import { err, ok } from "@forge-ahead/errors";
import { assert, describe, expect, it } from "vitest";
import { withLogContext } from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("withForgeInvocationLogging", () => {
  it("logs completion with duration and success outcome for a sync handler", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue", requestId: "req-1" };

    const result = withForgeInvocationLogging(
      logger,
      event,
      () => ({ ok: true }),
      { successMessage: "completed" },
    );

    expect(result).toEqual({ ok: true });
    const record = records[0];
    assert.isDefined(record);
    expect(record["level"]).toBe("info");
    expect(record["msg"]).toBe("completed");
    expect(record["outcome"]).toBe("success");
    expect(record["eventType"]).toBe("avi:jira:created:issue");
    expect(record["requestId"]).toBe("req-1");
    expect(typeof record["durationMs"]).toBe("number");
    expect(record["durationMs"]).toBeGreaterThanOrEqual(0);
  });

  it("logs completion with duration and success outcome for an async handler", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };

    const result = await withForgeInvocationLogging(logger, event, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return "done";
    });

    expect(result).toBe("done");
    const record = records[0];
    assert.isDefined(record);
    expect(record["outcome"]).toBe("success");
    expect(record["durationMs"]).toBeGreaterThanOrEqual(0);
  });

  it("logs and rethrows a sync thrown error", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };
    const error = new Error("boom");

    expect(() =>
      withForgeInvocationLogging(logger, event, () => {
        throw error;
      }),
    ).toThrow(error);

    expect(records).toHaveLength(1);
    const record = records[0];
    assert.isDefined(record);
    expect(record["level"]).toBe("error");
    expect(record["outcome"]).toBe("failure");
    expect(record["errorName"]).toBe("Error");
    expect(record["title"]).toBeUndefined();
    expect(record["status"]).toBeUndefined();
    expect(record["detail"]).toBeUndefined();
  });

  it("logs and rethrows an async rejection", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };
    const error = new Error("rejected");

    await expect(
      withForgeInvocationLogging(logger, event, async () => {
        throw error;
      }),
    ).rejects.toThrow(error);

    const record = records[0];
    assert.isDefined(record);
    expect(record["outcome"]).toBe("failure");
    expect(record["errorName"]).toBe("Error");
    expect(record["detail"]).toBeUndefined();
  });

  it("classifies an Err Result as failure", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };
    const result = err({
      type: "https://example.com/bad",
      title: "Bad",
      status: 400,
      detail: "bad",
      timestamp: "2024-01-01T00:00:00.000Z",
    });

    await expect(
      withForgeInvocationLogging(logger, event, async () => result),
    ).resolves.toBe(result);

    const record = records[0];
    assert.isDefined(record);
    expect(record["outcome"]).toBe("failure");
    expect(record["type"]).toBe("https://example.com/bad");
    expect(record["status"]).toBe(400);
    expect(record["detail"]).toBeUndefined();
    expect(record["title"]).toBeUndefined();
  });

  it("classifies an Ok Result as success", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };

    const result = await withForgeInvocationLogging(logger, event, async () =>
      ok({ value: 42 }),
    );

    expect(result.isOk()).toBe(true);
    const record = records[0];
    assert.isDefined(record);
    expect(record["outcome"]).toBe("success");
  });

  it("logs entry when opt-in", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };

    await withForgeInvocationLogging(logger, event, async () => "done", {
      logEntry: true,
      entryMessage: "entry",
    });

    expect(records).toHaveLength(2);
    const entry = records[0];
    const completion = records[1];
    assert.isDefined(entry);
    assert.isDefined(completion);
    expect(entry["level"]).toBe("info");
    expect(entry["msg"]).toBe("entry");
    expect(entry["eventType"]).toBe("avi:jira:created:issue");
    expect(completion["msg"]).toBe("invocation completed");
    expect(completion["outcome"]).toBe("success");
  });

  it("omits entry when opt-in but level is disabled", async () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "info" },
    });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };

    await withForgeInvocationLogging(logger, event, async () => "done", {
      logEntry: true,
      entryLevel: "debug",
      entryMessage: "entry",
    });

    expect(records).toHaveLength(1);
    assert.isDefined(records[0]);
    expect(records[0]["msg"]).toBe("invocation completed");
  });

  it("inherits ambient log context inside the handler", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };

    await withLogContext({ requestId: "ambient-1" }, async () =>
      withForgeInvocationLogging(logger, event, async () => {
        logger.info({ step: "inside" }, "inside handler");
      }),
    );

    const entry = records.find((r) => r["msg"] === "inside handler");
    assert.isDefined(entry);
    expect(entry["requestId"]).toBe("ambient-1");
  });

  it("supports logger.invocation as a convenience method", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const event = { eventType: "avi:jira:created:issue" };

    const result = await logger.invocation(event, async () => "done", {
      successMessage: "done",
    });

    expect(result).toBe("done");
    const record = records[0];
    assert.isDefined(record);
    expect(record["outcome"]).toBe("success");
    expect(record["msg"]).toBe("done");
  });

  it("applies summarizeResult on success", async () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const { withForgeInvocationLogging } = await import("../src/index");
    const event = { eventType: "avi:jira:created:issue" };

    await withForgeInvocationLogging(
      logger,
      event,
      async () => ({ id: "123", count: 7 }),
      {
        summarizeResult: (value) => ({ resultId: value["id"] }),
      },
    );

    const record = records[0];
    assert.isDefined(record);
    expect(record["outcome"]).toBe("success");
    expect(record["resultId"]).toBe("123");
    expect(record["count"]).toBeUndefined();
  });
});
