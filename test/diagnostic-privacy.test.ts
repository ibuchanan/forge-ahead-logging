import { err } from "@forge-ahead/errors";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import {
  defineLogObjectSummaryPolicy,
  installConsoleCapture,
  logForgeInvocation,
  logProbe,
  summarizeForgeInvocation,
  summarizeObjectForLog,
  withForgeInvocationLogging,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";
import { expectNoneEscaped } from "./privacy-helpers";

function eventShapeOptions(includeEventShape: boolean | undefined) {
  return includeEventShape === undefined ? {} : { includeEventShape };
}

const privateText =
  "synthetic-person@example.test Bearer synthetic-token customer comment";

function expectPrivateDataAbsent(value: unknown): void {
  expectNoneEscaped(Array.isArray(value) ? value : [value], [
    "synthetic-person",
    "synthetic-token",
    "customer comment",
  ]);
}

afterEach(() => vi.unstubAllEnvs());

it.each(
  (["info", "debug", "trace"] as const).flatMap((level) =>
    [
      {
        setting: "disabled",
        includeEventShape: false,
        envShape: "true",
        enabled: false,
      },
      {
        setting: "explicit",
        includeEventShape: true,
        envShape: "false",
        enabled: true,
      },
      {
        setting: "environment",
        includeEventShape: undefined,
        envShape: "true",
        enabled: true,
      },
      {
        setting: "default",
        includeEventShape: undefined,
        envShape: "false",
        enabled: false,
      },
    ].map((row) => ({ ...row, level })),
  ),
)(
  "does not restore excluded data with $setting event shape at $level",
  async ({ includeEventShape, envShape, enabled, level }) => {
    vi.stubEnv("FORGE_LOG_LABELS", "true");
    vi.stubEnv("FORGE_LOG_EVENT_SHAPE", envShape);
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: level },
    });
    const event = Object.freeze({
      method: "POST",
      path: privateText,
      contextToken: privateText,
      queryParameters: { [privateText]: [privateText] },
      context: { cloudId: privateText, accountId: privateText },
      headers: { authorization: privateText },
      body: privateText,
      [privateText]: privateText,
    });
    expect(summarizeForgeInvocation(event)).toEqual({
      kind: "forgeEvent",
      method: "POST",
      headers: { type: "object", keys: 1 },
      body: { type: "string", length: privateText.length },
    });
    const invocationOptions = eventShapeOptions(includeEventShape);
    logForgeInvocation(logger, event, "received", invocationOptions);
    logger.forgeInvocation(event, "received", invocationOptions);
    const options = { ...invocationOptions, logEntry: true };
    const result = { processed: true };
    expect(
      withForgeInvocationLogging(logger, event, () => result, options),
    ).toBe(result);
    await expect(
      logger.invocation(event, async () => result, options),
    ).resolves.toBe(result);
    const failure = Object.assign(new Error(privateText), {
      privateField: privateText,
    });
    const failed = err({
      code: "FAILED",
      message: privateText,
      [privateText]: privateText,
    });
    expect(logger.invocation(event, () => failed, options)).toBe(failed);
    await expect(
      logger.invocation(
        event,
        async () => {
          throw failure;
        },
        options,
      ),
    ).rejects.toBe(failure);
    const probeLevel = level === "trace" ? "trace" : "debug";
    const expression = vi.fn(() => event);
    const metadata = vi.fn(() => ({ [privateText]: privateText }));
    expect(
      logger.probe("operation", expression, {
        level: probeLevel,
        metadata,
      }),
    ).toBe(event);
    await expect(
      logger.probe("operation", Promise.reject(failure), {
        level: probeLevel,
        metadata,
      }),
    ).rejects.toBe(failure);
    expect(expression).toHaveBeenCalledOnce();
    expect(metadata).toHaveBeenCalledTimes(level === "info" ? 0 : 2);
    const uninstall = installConsoleCapture(logger);
    try {
      console.info("operation", event, failure, privateText);
      console.debug("operation", event);
      console.warn(event);
      console.error(failure);
    } finally {
      uninstall();
    }
    expect(records).toHaveLength(level === "info" ? 13 : 16);
    const invocationRecords = records.filter(
      (record) => record["kind"] === "forgeEvent",
    );
    expect(invocationRecords).toHaveLength(10);
    const shapeRecords = invocationRecords.filter((record) =>
      ["received", "invocation started"].includes(String(record["msg"])),
    );
    expect(shapeRecords).toHaveLength(6);
    for (const record of shapeRecords) {
      if (enabled && level !== "info")
        expect(record["eventShape"]).toMatchObject({
          type: "object",
          keys: 8,
        });
      else expect(record["eventShape"]).toBeUndefined();
      if (includeEventShape === true && level === "info")
        expect(record["eventShapeOmitted"]).toBe("requires debug or trace");
    }
    expectPrivateDataAbsent(records);
    expect(event.contextToken).toBe(privateText);
  },
);

describe("explicit label projection", () => {
  it.each(["true", "false", undefined])(
    "requires explicit inclusion regardless of FORGE_LOG_LABELS=%s",
    (labels) => {
      const policy = defineLogObjectSummaryPolicy({
        kind: "operation",
        fields: { id: "id" },
        labels: { name: "name", display: "customerText" },
      });
      const value = { id: 7, name: "sync", customerText: privateText };
      if (labels !== undefined) vi.stubEnv("FORGE_LOG_LABELS", labels);
      expect(summarizeObjectForLog(value, policy, {})).toEqual({
        kind: "operation",
        id: 7,
      });
      expect(
        summarizeObjectForLog(value, policy, { includeLabels: false }),
      ).toEqual({ kind: "operation", id: 7 });
      expect(
        summarizeObjectForLog(value, policy, { includeLabels: true }),
      ).toEqual({
        kind: "operation",
        id: 7,
        name: "sync",
        display: privateText,
      });
    },
  );
});

describe("structural bounds", () => {
  it("caps array entries, object entries, and depth without invoking getters", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const getter = vi.fn(() => {
      throw new Error(privateText);
    });
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const event = {
      first: Array.from({ length: 7 }, () => privateText),
      second: Object.fromEntries(
        Array.from({ length: 14 }, (_, i) => [`${privateText}${i}`, false]),
      ),
      third: { child: { child: { child: privateText } } },
      fourth: circular,
      get fifth() {
        return getter();
      },
    };
    logForgeInvocation(logger, event, "received", { includeEventShape: true });
    assert.isDefined(records[0]);
    expect(records[0]["eventShape"]).toEqual({
      type: "object",
      keys: 5,
      values: [
        {
          type: "array",
          items: 7,
          values: Array.from({ length: 5 }, () => ({
            type: "string",
            length: privateText.length,
          })),
          omitted: 2,
        },
        {
          type: "object",
          keys: 14,
          values: Array.from({ length: 12 }, () => ({ type: "boolean" })),
          omitted: 2,
        },
        {
          type: "object",
          keys: 1,
          values: [
            {
              type: "object",
              keys: 1,
              values: [{ type: "object", omitted: "max depth" }],
            },
          ],
        },
        {
          type: "object",
          keys: 1,
          values: [{ type: "object", omitted: "circular" }],
        },
        { type: "accessor" },
      ],
    });
    logForgeInvocation(logger, event, "received", {
      includeEventShape: true,
      maxObjectKeys: 1,
      maxArrayItems: 1,
      maxDepth: 1,
    });
    assert.isDefined(records[1]);
    expect(records[1]["eventShape"]).toEqual({
      type: "object",
      keys: 5,
      values: [{ type: "array", omitted: "max depth" }],
      omitted: 4,
    });
    expect(getter).not.toHaveBeenCalled();
    expectPrivateDataAbsent(records);
  });

  it("never stringifies special primitive values or invokes toJSON", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "trace" },
    });
    const toJSON = vi.fn(() => privateText);
    logger.probe("operation", [
      undefined,
      Symbol(privateText),
      123456789n,
      () => privateText,
      { toJSON },
    ]);
    assert.isDefined(records[0]);
    expect(records[0]["debugProbe"]).toEqual({
      label: "operation",
      value: {
        type: "array",
        items: 5,
        values: [
          { type: "undefined" },
          { type: "symbol" },
          { type: "bigint" },
          { type: "function" },
          { type: "object", keys: 1, values: [{ type: "function" }] },
        ],
      },
    });
    expect(toJSON).not.toHaveBeenCalled();
    expectPrivateDataAbsent(records);
  });
});

describe("structural probes", () => {
  it("does not compute explicit value or metadata projections when disabled", () => {
    const { logger, records } = createCapturingLogger();
    const selected = vi.fn(() => "reviewed operation");
    const value = {
      get operation() {
        return selected();
      },
    };
    const policy = defineLogObjectSummaryPolicy({
      kind: "operation",
      fields: { operation: "operation" },
    });
    expect(
      logger.probe("operation", value, {
        valuePolicy: policy,
        metadata: value,
        metadataPolicy: policy,
      }),
    ).toBe(value);
    expect(selected).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });
  it("does not let diagnostic failures replace application results or errors", async () => {
    const { logger } = createCapturingLogger({ env: { LOG_LEVEL: "trace" } });
    const result = { processed: true };
    const failure = new Error(privateText);
    const metadata = () => {
      throw new Error("diagnostic failed");
    };
    expect(logger.probe("operation", () => result, { metadata })).toBe(result);
    await expect(
      logger.probe("operation", Promise.resolve(result), { metadata }),
    ).resolves.toBe(result);
    let thrown: unknown;
    try {
      logger.probe(
        "operation",
        () => {
          throw failure;
        },
        { metadata },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    await expect(
      logger.probe("operation", Promise.reject(failure), { metadata }),
    ).rejects.toBe(failure);
  });
  it("uses explicit application policies for reviewed value and metadata fields", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const value = { name: "sync", id: 7, customerText: privateText };
    const valuePolicy = defineLogObjectSummaryPolicy({
      kind: "operation",
      fields: { name: "name", id: "id" },
    });
    const metadataPolicy = defineLogObjectSummaryPolicy({
      kind: "retry",
      fields: { attempts: "attempts" },
    });
    expect(
      logger.probe("operation", value, {
        valuePolicy,
        metadataPolicy,
        metadata: () => ({ attempts: 2, customer: privateText }),
      }),
    ).toBe(value);
    assert.isDefined(records[0]);
    expect(records[0]["debugProbe"]).toEqual({
      label: "operation",
      value: { kind: "operation", name: "sync", id: 7 },
      metadata: { kind: "retry", attempts: 2 },
    });
    expectPrivateDataAbsent(records);
  });
  it("keeps values and probe-only metadata structural without changing the result", async () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "trace" },
    });
    const value = Object.freeze({ [privateText]: privateText });
    const metadata = { account: privateText };
    expect(logProbe(logger, "operation", () => value, { metadata })).toBe(
      value,
    );
    await expect(
      logger.probe("operation", Promise.resolve(value), {
        level: "trace",
        metadata,
      }),
    ).resolves.toBe(value);
    for (const record of records) {
      expect(record["debugProbe"]).toEqual({
        label: "operation",
        value: {
          type: "object",
          keys: 1,
          values: [{ type: "string", length: privateText.length }],
        },
        metadata: {
          type: "object",
          keys: 1,
          values: [{ type: "string", length: privateText.length }],
        },
      });
    }
    expect(records).toHaveLength(2);
    expectPrivateDataAbsent(records);
  });
});

describe("structural invocation diagnostics", () => {
  it("contains uninspectable nested values without interrupting invocation logging", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error(privateText);
        },
      },
    );
    expect(() =>
      logForgeInvocation(logger, { payload: hostile }, "received", {
        includeEventShape: true,
      }),
    ).not.toThrow();
    assert.isDefined(records[0]);
    expect(records[0]["eventShape"]).toEqual({
      type: "unknown",
      omitted: "unavailable",
    });
    expectPrivateDataAbsent(records);
  });
  it("reports unnamed types and counts instead of property names or leaf values", () => {
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "debug" },
    });
    const event = Object.freeze({
      [privateText]: Object.freeze([privateText, 8675309, true, null]),
    });

    logForgeInvocation(logger, event, "received", { includeEventShape: true });

    assert.isDefined(records[0]);
    expect(records[0]["eventShape"]).toEqual({
      type: "object",
      keys: 1,
      values: [
        {
          type: "array",
          items: 4,
          values: [
            { type: "string", length: privateText.length },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
      ],
    });
    expectPrivateDataAbsent(records);
    expect(event[privateText]).toEqual([privateText, 8675309, true, null]);
  });
});
