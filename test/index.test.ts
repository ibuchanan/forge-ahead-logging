import { describe, expect, it } from "vitest";
import * as logging from "../src/index";

describe("package public surface", () => {
  it("does not export the copied error-helper APIs", () => {
    const copiedErrorExports = [
      "StandardError",
      "ProblemDetails",
      "isProblemDetails",
      "toErrorMessage",
      "toProblemDetails",
      "problemResult",
      "ShellExitCodes",
    ];

    for (const name of copiedErrorExports) {
      expect(name in logging).toBe(false);
    }
  });
});
