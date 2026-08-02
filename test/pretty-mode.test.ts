import { describe, expect, it } from "vitest";
import { createForgeLogger } from "../src/index";
import packageJson from "../package.json";

function createStringCapturingLogger(options?: {
  pretty?: boolean;
  env?: Record<string, string | undefined>;
}) {
  const lines: string[] = [];
  const destination = {
    write(chunk: string): void {
      lines.push(chunk);
    },
  };
  const logger = createForgeLogger(options, destination);
  return { logger, lines };
}

const ANSI_COLOR_PATTERN = new RegExp(
  `${String.fromCharCode(0x1b)}\\[[0-9;]*m`,
);

describe("pretty mode", () => {
  it("produces human-readable lines when pretty mode is enabled", () => {
    const { logger, lines } = createStringCapturingLogger({ pretty: true });

    logger.info({ userId: "u-123" }, "handling request");

    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toContain("handling request");
    expect(line).toContain("u-123");
    expect(line).toContain("INFO");
  });

  it("produces NDJSON when pretty mode is disabled", () => {
    const { logger, lines } = createStringCapturingLogger({ pretty: false });

    logger.info({ userId: "u-123" }, "handling request");

    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe("handling request");
    expect(parsed.userId).toBe("u-123");
  });

  it("does not include ANSI color codes in pretty output", () => {
    const { logger, lines } = createStringCapturingLogger({ pretty: true });

    logger.info({}, "hello");

    const line = lines[0];
    expect(line).not.toMatch(ANSI_COLOR_PATTERN);
  });

  it("does not enable pretty mode by default", () => {
    const { logger, lines } = createStringCapturingLogger();

    logger.info({ userId: "u-123" }, "hello");

    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe("hello");
  });

  it("enables pretty mode via FORGE_LOG_PRETTY env var", () => {
    const { logger, lines } = createStringCapturingLogger({
      env: { FORGE_LOG_PRETTY: "true" },
    });

    logger.info({}, "env pretty");

    expect(lines[0]).toContain("env pretty");
    expect(lines[0]).toContain("INFO");
  });

  it("remains NDJSON when FORGE_LOG_PRETTY is not set", () => {
    const { logger, lines } = createStringCapturingLogger({
      env: {},
    });

    logger.info({}, "ndjson");

    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe("ndjson");
  });
});

describe("pretty mode dependency seam", () => {
  it("does not add pino-pretty to production dependencies", () => {
    expect(packageJson.dependencies).not.toHaveProperty("pino-pretty");
  });
});
