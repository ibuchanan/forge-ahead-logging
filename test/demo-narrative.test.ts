import pino from "pino";
import { describe, expect, it } from "vitest";
import { createForgeLogger } from "../src/index";
import { captureForgeLoggerOutput } from "./helpers/capture-forge-logger-output";
import { createDemoNarrative } from "../src/demo";

const { loggedRecords } = captureForgeLoggerOutput();

describe("createDemoNarrative", () => {
  it("emits a demo.step() record through the supplied logger at info", () => {
    const logger = createForgeLogger({ env: {} });
    const demo = createDemoNarrative(logger, { storyId: "onboarding" });

    demo.step("user signs up");

    const [record] = loggedRecords();
    expect(record.level).toBe(pino.levels.values.info);
    expect(record.msg).toBe("user signs up");
    expect(record).toMatchObject({
      kind: "demoNarrativeStep",
      demoOnly: true,
      storyId: "onboarding",
      stepNumber: 1,
    });
  });

  it("increments stepNumber automatically across calls on the same narrative", () => {
    const logger = createForgeLogger({ env: {} });
    const demo = createDemoNarrative(logger, { storyId: "onboarding" });

    demo.step("first step");
    demo.step("second step");

    const [firstRecord, secondRecord] = loggedRecords();
    expect(firstRecord.stepNumber).toBe(1);
    expect(secondRecord.stepNumber).toBe(2);
  });

  it("accepts message-only steps with no metadata field", () => {
    const logger = createForgeLogger({ env: {} });
    const demo = createDemoNarrative(logger, { storyId: "onboarding" });

    demo.step("no metadata here");

    const [record] = loggedRecords();
    expect(record.metadata).toBeUndefined();
  });

  it("summarizes and redacts caller-provided step metadata", () => {
    const logger = createForgeLogger({ env: {} });
    const demo = createDemoNarrative(logger, { storyId: "onboarding" });

    demo.step("user signs up", { userId: "abc-123", password: "shh" });

    const [record] = loggedRecords();
    expect(record.metadata).toEqual({
      userId: "abc-123",
      password: "[redacted]",
    });
  });

  it("is not exported from the root package", async () => {
    const rootExports = await import("../src/index");
    expect(
      (rootExports as Record<string, unknown>).createDemoNarrative,
    ).toBeUndefined();
  });
});
