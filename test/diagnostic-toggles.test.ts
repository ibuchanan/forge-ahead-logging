import { afterEach, assert, describe, expect, it, vi } from "vitest";
import {
  defineLogObjectSummaryPolicy,
  logForgeInvocation,
  resolveLogLevel,
  summarizeObjectForLog,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";

const policyWithLabels = defineLogObjectSummaryPolicy({
  kind: "test",
  fields: { id: "id" },
  labels: { displayName: "displayName" },
});

describe("FORGE_LOG_LABELS", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not authorize value-bearing labels from the env var alone", () => {
    vi.stubEnv("FORGE_LOG_LABELS", "true");
    const result = summarizeObjectForLog(
      { id: 1, displayName: "Test" },
      policyWithLabels,
      {},
    );

    expect(result["displayName"]).toBeUndefined();
  });

  it("excludes labels when the env var is unset", () => {
    const result = summarizeObjectForLog(
      { id: 1, displayName: "Test" },
      policyWithLabels,
      {},
    );

    expect(result["displayName"]).toBeUndefined();
  });

  it("lets explicit includeLabels override the env var", () => {
    vi.stubEnv("FORGE_LOG_LABELS", "true");
    const result = summarizeObjectForLog(
      { id: 1, displayName: "Test" },
      policyWithLabels,
      { includeLabels: false },
    );

    expect(result["displayName"]).toBeUndefined();
  });
});

describe("FORGE_LOG_EVENT_SHAPE", () => {
  it("includes event shape when env var is true and level is debug", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug", FORGE_LOG_EVENT_SHAPE: "true" },
    });
    const event = {
      eventType: "test",
      method: "GET",
      path: "/",
      requestId: "req-1",
    };

    logForgeInvocation(logger, event, "hello", undefined, {
      FORGE_LOG_EVENT_SHAPE: "true",
    });

    const record = records[0];
    assert.isDefined(record);
    assert.isDefined(record["eventShape"]);
  });

  it("omits event shape when env var is true but level is info", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "info" },
    });
    const event = {
      eventType: "test",
      method: "GET",
      path: "/",
      requestId: "req-1",
    };

    logForgeInvocation(logger, event, "hello", undefined, {
      FORGE_LOG_EVENT_SHAPE: "true",
    });

    const record = records[0];
    assert.isDefined(record);
    expect(record["eventShape"]).toBeUndefined();
    expect(record["eventShapeOmitted"]).toBeUndefined();
  });

  it("lets explicit includeEventShape override the env var", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "info" },
    });
    const event = {
      eventType: "test",
      method: "GET",
      path: "/",
      requestId: "req-1",
    };

    logForgeInvocation(
      logger,
      event,
      "hello",
      { includeEventShape: false },
      { FORGE_LOG_EVENT_SHAPE: "true" },
    );

    const record = records[0];
    assert.isDefined(record);
    expect(record["eventShape"]).toBeUndefined();
  });
});

describe("resolveLogLevel", () => {
  it("does not report diagnostic toggles as level sources", () => {
    const result = resolveLogLevel({
      FORGE_LOG_LABELS: "true",
      FORGE_LOG_EVENT_SHAPE: "true",
    });

    expect(result.level).toBe("info");
    expect(result.source).toBe("default");
  });
});
