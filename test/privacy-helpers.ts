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
