import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";

describe("AsyncLocalStorage local spike", () => {
  const store = new AsyncLocalStorage<{ requestId: string }>();

  async function nestedAsyncCall(): Promise<string> {
    await Promise.resolve();
    const context = store.getStore();
    if (context === undefined) {
      throw new Error("context lost after nested async call");
    }
    return context.requestId;
  }

  async function handler(requestId: string): Promise<string> {
    return store.run({ requestId }, async () => {
      await Promise.resolve();
      return nestedAsyncCall();
    });
  }

  it("preserves context across an await and a nested async call", async () => {
    const result = await handler("req-1");

    expect(result).toBe("req-1");
  });

  it("isolates concurrent invocations", async () => {
    const results = await Promise.all([
      handler("req-a"),
      handler("req-b"),
      handler("req-c"),
    ]);

    expect(results).toEqual(["req-a", "req-b", "req-c"]);
  });

  it("is empty outside any run scope", async () => {
    await Promise.resolve();

    expect(store.getStore()).toBeUndefined();
  });
});
