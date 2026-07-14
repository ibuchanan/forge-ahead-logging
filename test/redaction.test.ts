import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createForgeLogger,
  DEFAULT_REDACT_PATHS,
  DEFAULT_REDACTION_CENSOR,
  withDefaultRedaction,
} from "../src/index";

let writtenLines: string[];

beforeEach(() => {
  writtenLines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writtenLines.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedRecords(): Record<string, unknown>[] {
  return writtenLines.map((line) => JSON.parse(line));
}

describe("createForgeLogger default redaction", () => {
  it("censors a representative secret-shaped field but keeps the key present", () => {
    const logger = createForgeLogger({ env: {} });

    logger.info({ password: "hunter2" }, "logging in");

    const [record] = loggedRecords();
    expect(record.password).toBe("[redacted]");
  });

  it("censors a nested secret-shaped field while keeping sibling fields and shape intact", () => {
    const logger = createForgeLogger({ env: {} });

    logger.info(
      {
        headers: { authorization: "Bearer secret", "content-type": "json" },
      },
      "incoming request",
    );

    const [record] = loggedRecords();
    const headers = record.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[redacted]");
    expect(headers["content-type"]).toBe("json");
  });

  it("merges a caller-supplied redact option with the defaults", () => {
    const logger = createForgeLogger({
      env: {},
      redact: ["customSecretField"],
    });

    logger.info(
      { customSecretField: "shh", password: "hunter2" },
      "custom + default redaction",
    );

    const [record] = loggedRecords();
    expect(record.customSecretField).toBe("[redacted]");
    expect(record.password).toBe("[redacted]");
  });
});

describe("withDefaultRedaction", () => {
  it("merges caller paths with the defaults", () => {
    const result = withDefaultRedaction(["custom.secretField"]);

    expect(result).toEqual({
      paths: [...DEFAULT_REDACT_PATHS, "custom.secretField"],
      censor: DEFAULT_REDACTION_CENSOR,
      remove: false,
    });
  });
});
