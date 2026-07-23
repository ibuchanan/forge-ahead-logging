import fs from "node:fs";
import { afterEach, beforeEach, vi } from "vitest";

const STDOUT_FD = 1;

/**
 * createForgeLogger() writes via a synchronous SonicBoom destination on fd 1,
 * which calls fs.writeSync() directly rather than process.stdout.write(), so
 * that's the layer this helper has to intercept to observe emitted records.
 */
export function captureForgeLoggerOutput(): {
  loggedRecords: () => Record<string, unknown>[];
} {
  let writtenLines: string[];

  beforeEach(() => {
    writtenLines = [];
    vi.spyOn(fs, "writeSync").mockImplementation((fd, buffer) => {
      if (fd === STDOUT_FD) {
        writtenLines.push(String(buffer));
      }
      return String(buffer).length;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return {
    loggedRecords: () =>
      writtenLines
        .join("")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line)),
  };
}
