import { afterEach, beforeEach, vi } from "vitest";

const CAPTURED_CONSOLE_METHODS = ["error", "warn", "info", "debug"] as const;

/**
 * createForgeLogger() writes by dispatching each line to console.error/warn/
 * info/debug (Forge's log capture reads console.*, not raw fd writes), so
 * that's the layer this helper has to intercept to observe emitted records.
 */
export function captureForgeLoggerOutput(): {
  loggedRecords: () => Record<string, unknown>[];
} {
  let writtenLines: string[];

  beforeEach(() => {
    writtenLines = [];
    for (const method of CAPTURED_CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation((line: string) => {
        writtenLines.push(line);
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return {
    loggedRecords: () => writtenLines.map((line) => JSON.parse(line)),
  };
}
