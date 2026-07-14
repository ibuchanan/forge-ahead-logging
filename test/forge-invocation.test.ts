import pino from "pino";
import { describe, expect, it } from "vitest";
import {
  createForgeLogger,
  logForgeInvocation,
  summarizeForgeInvocation,
} from "../src/index";
import { captureForgeLoggerOutput } from "./helpers/capture-forge-logger-output";

const { loggedRecords } = captureForgeLoggerOutput();

describe("summarizeForgeInvocation", () => {
  it("matches the spec's Forge event summary example", () => {
    const event = {
      contextToken: "1234567890",
      headers: { authorization: "Bearer secret", cookie: "sid=abc" },
      body: '{"secret":"payload"}',
    };

    const result = summarizeForgeInvocation(event);

    expect(result).toEqual({
      kind: "forgeEvent",
      contextToken: "123...890",
      headers: { omitted: true, keys: 2 },
      body: { omitted: true, length: 20 },
    });
  });

  it("promotes routing fields when present and omits missing ones", () => {
    const event = {
      eventType: "avi:jira:created:issue",
      method: "POST",
      path: "/webhook",
      requestId: "req-1",
      context: { cloudId: "cloud-1", moduleKey: "module-1" },
      call: { functionKey: "fn-1" },
      app: { id: "app-1", version: "1.0.0" },
      selfGenerated: false,
      queryParameters: { foo: ["bar"] },
    };

    const result = summarizeForgeInvocation(event);

    expect(result).toEqual({
      kind: "forgeEvent",
      eventType: "avi:jira:created:issue",
      method: "POST",
      path: "/webhook",
      requestId: "req-1",
      cloudId: "cloud-1",
      moduleKey: "module-1",
      functionKey: "fn-1",
      appId: "app-1",
      appVersion: "1.0.0",
      selfGenerated: false,
      queryParameters: { foo: ["bar"] },
    });
  });
});

describe("logForgeInvocation", () => {
  it("logs the policy-selected summary at info by default", () => {
    const logger = createForgeLogger({ env: {} });
    const event = { eventType: "avi:jira:created:issue", method: "POST" };

    logForgeInvocation(logger, event, "invocation received");

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.info);
    expect(record.msg).toBe("invocation received");
    expect(record.eventType).toBe("avi:jira:created:issue");
    expect(record.method).toBe("POST");
  });

  it("omits the event shape at info and includes eventShapeOmitted instead", () => {
    const logger = createForgeLogger({ env: {} });
    const event = { eventType: "avi:jira:created:issue", secret: "shh" };

    logForgeInvocation(logger, event, "invocation received", {
      includeEventShape: true,
    });

    const [record] = loggedRecords();
    expect(record.eventShape).toBeUndefined();
    expect(record.eventShapeOmitted).toBe("requires debug or trace");
  });

  it("includes the full bounded event shape at debug", () => {
    const logger = createForgeLogger({ env: { LOG_LEVEL: "debug" } });
    const event = { eventType: "avi:jira:created:issue", secret: "shh" };

    logForgeInvocation(logger, event, "invocation received", {
      includeEventShape: true,
      level: "debug",
    });

    const [record] = loggedRecords();
    expect(record.eventShapeOmitted).toBeUndefined();
    expect(record.eventShape).toEqual({
      eventType: "avi:jira:created:issue",
      secret: "[redacted]",
    });
  });
});

describe("logger.forgeInvocation", () => {
  it("delegates to logForgeInvocation", () => {
    const logger = createForgeLogger({ env: {} });
    const event = { eventType: "avi:jira:created:issue", method: "POST" };

    logger.forgeInvocation(event, "invocation received");

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.info);
    expect(record.eventType).toBe("avi:jira:created:issue");
  });
});
