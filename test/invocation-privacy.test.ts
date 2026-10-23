import { err, ok } from "@forge-ahead/errors";
import { describe, expect, it } from "vitest";
import {
  defineLogObjectSummaryPolicy,
  FORGE_EVENT_SUMMARY_POLICY,
  logForgeInvocation,
  summarizeForgeInvocation,
  summarizeObjectForLog,
  withForgeInvocationLogging,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";
import { expectNoneEscaped } from "./privacy-helpers";

const event = {
  eventType: "avi:jira:created:issue",
  method: "POST",
  requestId: "req-1",
  contextToken: "SYNTHETIC-authorization-token-END",
  path: "/customers/synthetic-person@example.test/private-issue",
  url: "https://synthetic-site.example.test/private-issue?search=customer-note",
  queryParameters: { "customer-query-key": ["customer-query-value"] },
  context: {
    cloudId: "customer-cloud-id",
    accountId: "customer-account-id",
    siteId: "customer-site-id",
    tenantId: "customer-tenant-id",
  },
  headers: { authorization: "Bearer synthetic-header-token" },
  body: "private customer text",
  issue: { summary: "private customer issue" },
};

const expectedSummary = {
  kind: "forgeEvent",
  eventType: "avi:jira:created:issue",
  method: "POST",
  requestId: "req-1",
  headers: { omitted: true, keys: 1 },
  body: { omitted: true, length: 21 },
};

function expectMinimized(value: unknown): void {
  expectNoneEscaped(
    [value],
    [
      "SYNTHETIC",
      "END",
      "authorization-token",
      "contextToken",
      "synthetic-person",
      "synthetic-site",
      "private-issue",
      "customer-query",
      "customer-cloud-id",
      "customer-account-id",
      "customer-site-id",
      "customer-tenant-id",
      "synthetic-header-token",
      "private customer",
    ],
  );
}

describe.each(["info", "debug", "trace"] as const)(
  "built-in invocation privacy at %s logger threshold",
  (level) => {
    it("minimizes standalone summaries and the exported Object Summary Policy", () => {
      const summary = summarizeForgeInvocation(event, {
        maxDepth: 10,
        maxStringLength: 10000,
      });
      expect(summary).toEqual(expectedSummary);
      expectMinimized(summary);
      expect(summarizeObjectForLog(event, FORGE_EVENT_SUMMARY_POLICY)).toEqual(
        expectedSummary,
      );
    });

    it("emits the same minimized summary through standalone and logger methods", () => {
      const { logger, records } = createCapturingLogger({
        env: { LOG_LEVEL: level },
      });
      const recordLevel = level === "info" ? "info" : "debug";
      logForgeInvocation(logger, event, "received", {
        level: recordLevel,
        includeEventShape: false,
      });
      logger.forgeInvocation(event, "received", {
        level: recordLevel,
        includeEventShape: false,
      });

      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(record).toMatchObject({
          ...expectedSummary,
          level: recordLevel,
        });
        expectMinimized(record);
      }
    });

    it("minimizes lifecycle entry, success, and failure without changing outcomes", async () => {
      const { logger, records } = createCapturingLogger({
        env: { LOG_LEVEL: level },
      });
      const recordLevel = level === "info" ? "info" : "debug";
      const options = {
        logEntry: true,
        entryLevel: recordLevel,
        successLevel: recordLevel,
        includeEventShape: false,
      } as const;
      const returned = { processed: true };
      expect(
        withForgeInvocationLogging(
          logger,
          event,
          (received) => {
            expect(received).toBe(event);
            return returned;
          },
          options,
        ),
      ).toBe(returned);
      const success = ok(returned);
      await expect(
        logger.invocation(event, async () => success, options),
      ).resolves.toBe(success);
      const failure = err({ code: "FAILED" });
      expect(logger.invocation(event, () => failure, options)).toBe(failure);
      const error = new Error("operation failed");
      expect(() =>
        logger.invocation(
          event,
          () => {
            throw error;
          },
          options,
        ),
      ).toThrow(error);
      await expect(
        logger.invocation(
          event,
          async () => {
            throw error;
          },
          options,
        ),
      ).rejects.toBe(error);

      expect(records).toHaveLength(10);
      expect(
        records
          .filter((record) => record["outcome"])
          .map((record) => record["outcome"]),
      ).toEqual(["success", "success", "failure", "failure", "failure"]);
      for (const record of records) {
        expect(record).toMatchObject(expectedSummary);
        expectMinimized(record);
      }
    });
  },
);

it("allows deliberate identifier projection without restoring built-in fields", () => {
  const policy = defineLogObjectSummaryPolicy({
    kind: "supportCorrelation",
    fields: { cloudId: "context.cloudId" },
  });

  expect(summarizeObjectForLog(event, policy)).toEqual({
    kind: "supportCorrelation",
    cloudId: "customer-cloud-id",
  });
  expect(summarizeForgeInvocation(event)).toEqual(expectedSummary);
});
