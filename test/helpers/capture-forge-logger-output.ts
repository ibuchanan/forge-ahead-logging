import { afterEach, beforeEach, vi } from "vitest";

export function captureForgeLoggerOutput(): {
  loggedRecords: () => Record<string, unknown>[];
} {
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

  return {
    loggedRecords: () => writtenLines.map((line) => JSON.parse(line)),
  };
}
