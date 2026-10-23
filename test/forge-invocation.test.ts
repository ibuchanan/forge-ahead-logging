import { assert, describe, expect, it } from "vitest";
import { logForgeInvocation, summarizeForgeInvocation } from "../src/index";
import { createCapturingLogger } from "../src/testing";

describe("summarizeForgeInvocation", () => {
  it("omits authorization tokens entirely, even without logger redaction", () => {
    const event = {
      contextToken: "1234567890",
      headers: { authorization: "Bearer secret", cookie: "sid=abc" },
      body: '{"secret":"payload"}',
    };

    const result = summarizeForgeInvocation(event);

    expect(result).toEqual({
      kind: "forgeEvent",
      headers: { omitted: true, keys: 2 },
      body: { omitted: true, length: 20 },
    });
  });

  it("retains operational fields but omits paths, queries, and customer identifiers", () => {
    const event = {
      eventType: "avi:jira:created:issue",
      method: "POST",
      path: "/customers/synthetic-person@example.test/private-issue",
      url: "https://synthetic-site.example.test/private-issue?search=customer-note",
      requestId: "req-1",
      cloudId: "synthetic-cloud",
      accountId: "synthetic-account",
      siteId: "synthetic-site",
      tenantId: "synthetic-tenant",
      context: {
        cloudId: "synthetic-cloud",
        accountId: "synthetic-account",
        siteId: "synthetic-site",
        tenantId: "synthetic-tenant",
        moduleKey: "module-1",
      },
      call: { functionKey: "fn-1" },
      app: { id: "app-1", version: "1.0.0" },
      selfGenerated: false,
      queryParameters: { "customer-search": ["private customer note"] },
    };

    expect(summarizeForgeInvocation(event)).toEqual({
      kind: "forgeEvent",
      eventType: "avi:jira:created:issue",
      method: "POST",
      requestId: "req-1",
      moduleKey: "module-1",
      functionKey: "fn-1",
      appId: "app-1",
      appVersion: "1.0.0",
      selfGenerated: false,
    });
  });
});

describe("logForgeInvocation", () => {
  it("logs the policy-selected summary at info by default", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const event = { eventType: "avi:jira:created:issue", method: "POST" };

    logForgeInvocation(logger, event, "invocation received");

    const record = records[0];
    assert.isDefined(record);
    expect(record["level"]).toBe("info");
    expect(record["msg"]).toBe("invocation received");
    expect(record["eventType"]).toBe("avi:jira:created:issue");
    expect(record["method"]).toBe("POST");
  });

  it("omits the event shape at info and includes eventShapeOmitted instead", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const event = { eventType: "avi:jira:created:issue", secret: "shh" };

    logForgeInvocation(logger, event, "invocation received", {
      includeEventShape: true,
    });

    const record = records[0];
    assert.isDefined(record);
    expect(record["eventShape"]).toBeUndefined();
    expect(record["eventShapeOmitted"]).toBe("requires debug or trace");
  });

  it("includes a bounded structural event shape at debug", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const event = { eventType: "avi:jira:created:issue", secret: "shh" };

    logForgeInvocation(logger, event, "invocation received", {
      includeEventShape: true,
      level: "debug",
    });

    const record = records[0];
    assert.isDefined(record);
    expect(record["eventShapeOmitted"]).toBeUndefined();
    expect(record["eventShape"]).toEqual({
      type: "object",
      keys: 2,
      values: [
        { type: "string", length: 22 },
        { type: "string", length: 3 },
      ],
    });
  });
});

describe("logger.forgeInvocation", () => {
  it("delegates to logForgeInvocation", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const event = { eventType: "avi:jira:created:issue", method: "POST" };

    logger.forgeInvocation(event, "invocation received");

    const record = records[0];
    assert.isDefined(record);
    expect(record["level"]).toBe("info");
    expect(record["eventType"]).toBe("avi:jira:created:issue");
  });
});
