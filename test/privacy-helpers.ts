import { expect } from "vitest";

/** Fails with the offending record instead of dumping every serialized record. */
export function expectNoneEscaped(
  records: readonly unknown[],
  forbidden: readonly string[],
): void {
  for (const [index, record] of records.entries()) {
    const serialized = JSON.stringify(record);
    for (const fragment of forbidden) {
      if (serialized.includes(fragment)) {
        expect.fail(
          `"${fragment}" escaped into record ${index}: ${serialized}`,
        );
      }
    }
  }
}

/** Runs one assertion body per log level, naming the level in any failure. */
export async function atEachLevel<L extends string>(
  levels: readonly L[],
  body: (level: L) => void | Promise<void>,
): Promise<void> {
  for (const level of levels) {
    try {
      await body(level);
    } catch (error) {
      if (error instanceof Error) {
        error.message = `[LOG_LEVEL=${level}] ${error.message}`;
      }
      throw error;
    }
  }
}
