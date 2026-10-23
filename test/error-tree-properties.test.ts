import { err } from "@forge-ahead/errors";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { logError } from "../src/index";
import { createCapturingLogger } from "../src/testing";

const failureDescription = fc.record({
  kind: fc.constantFrom("native", "domain", "problem", "aggregate", "unknown"),
  text: fc.string({ maxLength: 80 }),
  unexpectedEvidence: fc.jsonValue({ maxDepth: 2 }),
});

// Construct fresh nodes per run so linking/freezing cannot contaminate shrinking.
// Expected projections come from the category, not the production classifier.
function makeFailure({
  kind,
  text,
  unexpectedEvidence,
}: {
  kind: string;
  text: string;
  unexpectedEvidence: unknown;
}) {
  const privateText = `private-payload:${text}`;
  let error: Error | Record<string, unknown>;
  let summary: Record<string, unknown>;
  switch (kind) {
    case "native":
      error = Object.assign(new TypeError(privateText), { stack: privateText });
      summary = { errorName: "TypeError" };
      break;
    case "domain":
      error = { code: "UPSTREAM_BUSY", message: privateText };
      summary = { errorCode: "UPSTREAM_BUSY" };
      break;
    case "problem":
      error = {
        type: "urn:problem:throttled",
        status: 429,
        title: privateText,
        detail: privateText,
        instance: privateText,
      };
      summary = { type: "urn:problem:throttled", status: 429 };
      break;
    case "aggregate":
      error = new AggregateError([new Error(privateText)], privateText);
      summary = { errorName: "AggregateError" };
      break;
    default:
      error = { message: privateText };
      summary = {};
  }
  Object.assign(error, { unexpectedEvidence });
  return { error, summary: { ...summary, outcome: "failure" } };
}

const boundaryFailures = (
  ["native", "domain", "problem", "aggregate", "unknown"] as const
).map((kind) => ({
  kind,
  text: "boundary",
  unexpectedEvidence: null,
}));

describe("generated error trees", () => {
  it("bounds mixed cause chains and cycles without leaking payloads or replacing failures", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(failureDescription, { minLength: 1, maxLength: 12 }),
        fc.option(fc.nat({ max: 11 }), { nil: undefined }),
        fc.constantFrom("info", "debug", "trace"),
        async (descriptions, cycle, level) => {
          const nodes = descriptions.map(makeFailure);
          for (let index = 0; index < nodes.length - 1; index++) {
            nodes[index].error.cause = nodes[index + 1].error;
          }
          const target = cycle === undefined ? undefined : cycle % nodes.length;
          if (target !== undefined)
            nodes[nodes.length - 1].error.cause = nodes[target].error;
          for (const { error } of nodes) Object.freeze(error);
          const { logger, records } = createCapturingLogger({
            env: { LOG_LEVEL: level },
          });
          const root = nodes[0].error;
          // A root-linked cycle may include the root once; other cycles revisit an already-seen cause.
          const reachable = nodes.slice(1).map(({ summary }) => summary);
          if (target === 0) reachable.push(nodes[0].summary);
          const expected = {
            ...nodes[0].summary,
            ...(root instanceof AggregateError
              ? { errors: [{ errorName: "Error", outcome: "failure" }] }
              : {}),
            ...(reachable.length ? { causes: reachable.slice(0, 3) } : {}),
          };
          const result = err(root);
          logError(logger, root);
          logger.result(result);
          expect(result.error).toBe(root);
          let thrown: unknown;
          try {
            logger.invocation({}, () => {
              throw root;
            });
          } catch (error) {
            thrown = error;
          }
          expect(thrown).toBe(root);
          await expect(
            logger.invocation({}, async () => {
              throw root;
            }),
          ).rejects.toBe(root);

          expect(records).toEqual([
            ...Array.from({ length: 2 }, () => ({
              level: "error",
              time: expect.any(Number),
              ...expected,
            })),
            ...Array.from({ length: 2 }, () => ({
              level: "error",
              time: expect.any(Number),
              ...expected,
              kind: "forgeEvent",
              durationMs: expect.any(Number),
              msg: "invocation completed",
            })),
          ]);
          expect(JSON.stringify(records)).not.toContain("private-payload:");
          for (let index = 0; index < nodes.length - 1; index++) {
            expect(nodes[index].error.cause).toBe(nodes[index + 1].error);
          }
          expect(nodes[nodes.length - 1].error.cause).toBe(
            target === undefined ? undefined : nodes[target].error,
          );
        },
      ),
      {
        examples: [
          [[boundaryFailures[0]], undefined, "info"],
          [[boundaryFailures[0]], 0, "trace"],
          [boundaryFailures.slice(0, 2), 0, "debug"],
          [boundaryFailures.slice(0, 3), 1, "trace"],
          [boundaryFailures.slice(0, 4), undefined, "info"],
          [boundaryFailures, undefined, "trace"],
        ],
      },
    );
  });

  it("limits aggregates to three shallow projections without inspecting member branches", () => {
    fc.assert(
      fc.property(
        fc.array(failureDescription, { maxLength: 12 }),
        fc.string({ maxLength: 80 }),
        fc.constantFrom("info", "debug", "trace"),
        (descriptions, message, level) => {
          const nodes = descriptions.map(makeFailure);
          const inspect = vi.fn(() => {
            throw new Error("private-payload:unvisited branch");
          });
          for (const { error } of nodes) {
            Object.defineProperty(error, "cause", { get: inspect });
            if (error instanceof AggregateError)
              Object.defineProperty(error, "errors", { get: inspect });
            Object.freeze(error);
          }
          const aggregate = new AggregateError(
            nodes.map(({ error }) => error),
            `private-payload:${message}`,
          );
          Object.freeze(aggregate.errors);
          Object.freeze(aggregate);
          const { logger, records } = createCapturingLogger({
            env: { LOG_LEVEL: level },
          });

          logError(logger, aggregate);
          logger.result(err(aggregate));

          expect(records).toEqual(
            Array.from({ length: 2 }, () => ({
              level: "error",
              time: expect.any(Number),
              errorName: "AggregateError",
              outcome: "failure",
              errors: nodes.slice(0, 3).map(({ summary }) => summary),
            })),
          );
          expect(inspect).not.toHaveBeenCalled();
          expect(JSON.stringify(records)).not.toContain("private-payload:");
          expect(aggregate.errors).toEqual(nodes.map(({ error }) => error));
        },
      ),
      {
        examples: [
          [[], "empty", "info"],
          [boundaryFailures.slice(0, 3), "exact limit", "debug"],
          [boundaryFailures, "over limit", "trace"],
          [[boundaryFailures[3]], "nested aggregate", "trace"],
        ],
      },
    );
  });
});
