import { err } from "@forge-ahead/errors";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  installConsoleCapture,
  logError,
  logForgeInvocation,
  logProbe,
  logResult,
  withForgeInvocationLogging,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";
import { type Plant, plant, plantedValue } from "./privacy-arbitraries";
import { expectNoneEscaped } from "./privacy-helpers";

const failureKind = fc.constantFrom(
  "native",
  "domain",
  "problem",
  "aggregate",
  "plain",
  "string",
);

// Every kind carries the canary in fields the contract must never emit.
function makeFailure(kind: string, p: Plant): unknown {
  const payload = { [p.root]: plantedValue(p) };
  switch (kind) {
    case "native":
      return Object.assign(new TypeError(p.canary), payload, {
        stack: `${p.canary}\n    at ${p.canary}`,
      });
    case "domain":
      return { code: "CONFLICT", message: p.canary, ...payload };
    case "problem":
      return {
        type: "urn:problem:conflict",
        status: 409,
        title: p.canary,
        detail: p.canary,
        instance: p.canary,
        ...payload,
      };
    case "aggregate":
      return Object.assign(
        new AggregateError([new Error(p.canary)], p.canary, { cause: payload }),
        payload,
      );
    case "plain":
      return { message: p.canary, ...payload };
    default:
      return p.canary;
  }
}

function settle(operation: () => unknown): unknown {
  try {
    return operation();
  } catch (thrown) {
    return thrown;
  }
}

describe("private payloads never reach log records through any public seam", () => {
  it("keeps a planted canary out of every record while preserving application outcomes", async () => {
    await fc.assert(
      fc.asyncProperty(
        plant,
        failureKind,
        fc.constantFrom("info", "debug", "trace"),
        fc.boolean(),
        async (p, kind, level, includeEventShape) => {
          const event = { method: "POST", [p.root]: plantedValue(p) };
          const error = makeFailure(kind, p);
          const failed = err(error);
          const { logger, records } = createCapturingLogger({
            env: { LOG_LEVEL: level },
          });
          const probeLevel = level === "trace" ? "trace" : "debug";
          const options = { logEntry: true, includeEventShape };

          logForgeInvocation(logger, event, "received", { includeEventShape });
          logger.forgeInvocation(event, "received", { includeEventShape });
          expect(
            withForgeInvocationLogging(logger, event, () => failed, options),
          ).toBe(failed);
          expect(
            settle(() =>
              withForgeInvocationLogging(
                logger,
                event,
                () => {
                  throw error;
                },
                options,
              ),
            ),
          ).toBe(error);
          await expect(
            logger.invocation(
              event,
              async () => {
                throw error;
              },
              options,
            ),
          ).rejects.toBe(error);
          logResult(logger, failed);
          logger.result(failed);
          logError(logger, error);
          logger.errorResult(error);
          expect(
            logProbe(logger, "probe", () => event, {
              level: probeLevel,
              metadata: () => event,
            }),
          ).toBe(event);
          expect(
            settle(() =>
              logProbe(
                logger,
                "probe",
                () => {
                  throw error;
                },
                { level: probeLevel, metadata: event },
              ),
            ),
          ).toBe(error);
          await expect(
            logger.probe("probe", Promise.reject(error), {
              level: probeLevel,
              metadata: event,
            }),
          ).rejects.toBe(error);
          const uninstall = installConsoleCapture(logger);
          try {
            // A leading string is the console message by design, so wrap failures.
            console.info("operation", event, { error });
            console.warn(event);
            console.error({ error });
            console.debug("operation", event);
          } finally {
            uninstall();
          }

          expect(records.length).toBeGreaterThan(0);
          expectNoneEscaped(records, [p.canary]);
        },
      ),
    );
  });
});
