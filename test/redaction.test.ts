import fc from "fast-check";
import { assert, describe, expect, it, vi } from "vitest";
import {
  createForgeLogger,
  DEFAULT_REDACT_PATHS,
  DEFAULT_REDACTION_CENSOR,
  installConsoleCapture,
  unwrapPinoLogger,
  withDefaultRedaction,
  withLogContext,
} from "../src/index";
import { createCapturingLogger } from "../src/testing";
import { secretKey, secretKeys } from "./privacy-arbitraries";

describe("createForgeLogger default redaction", () => {
  it("redacts mixed-case secret keys at generated object/array depths without losing siblings or mutating inputs", () => {
    fc.assert(
      fc.property(
        secretKey,
        fc.jsonValue({ maxDepth: 2 }),
        fc.array(fc.boolean(), { maxLength: 24 }),
        fc.integer(),
        (key, secret, arrays, status) => {
          const leaf = Object.freeze({ [key]: secret, status });
          let input: unknown = leaf;
          let expected: unknown = { [key]: "[redacted]", status };
          for (const array of arrays) {
            input = Object.freeze(array ? [input] : { next: input });
            expected = array ? [expected] : { next: expected };
          }
          const before = JSON.stringify(input);
          const { logger, records } = createCapturingLogger({ env: {} });

          logger.info({ data: input }, "batch");
          logger.info({ data: input }, "batch again");

          expect(records).toHaveLength(2);
          for (const record of records)
            expect(record["data"]).toEqual(expected);
          expect(JSON.stringify(input)).toBe(before);
          expect(leaf[key]).toBe(secret);
        },
      ),
      {
        examples: secretKeys.map((key): [string, string, boolean[], number] => [
          key,
          "synthetic-secret",
          [true, false, true, false],
          202,
        ]),
      },
    );
  });

  it("censors base and inherited child snapshots as well as actual console output", () => {
    const secret = "synthetic-binding-secret";
    const bindings = Object.freeze({
      service: Object.freeze({
        credentials: Object.freeze({ token: secret }),
        region: "west",
      }),
    });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const logger = createForgeLogger({ env: {}, base: bindings });
      const child = logger.child({ childData: bindings });
      const grandchild = child.child({ operation: "sync" });
      grandchild.info("bound record");

      expect(unwrapPinoLogger(logger).bindings()).toEqual({
        service: { credentials: { token: "[redacted]" }, region: "west" },
      });
      expect(unwrapPinoLogger(grandchild).bindings()).toMatchObject({
        childData: {
          service: { credentials: { token: "[redacted]" }, region: "west" },
        },
        operation: "sync",
      });
      expect(spy).toHaveBeenCalledOnce();
      assert.isDefined(spy.mock.calls[0]);
      const line = spy.mock.calls[0][0] as string;
      expect(line).not.toContain(secret);
      expect(JSON.parse(line)).toMatchObject({
        msg: "bound record",
        service: { credentials: { token: "[redacted]" }, region: "west" },
        operation: "sync",
      });
      expect(bindings.service.credentials.token).toBe(secret);
    } finally {
      spy.mockRestore();
    }
  });

  it("skips traversal and metadata evaluation for disabled records including console capture", () => {
    const inspect = vi.fn(() => {
      throw new Error("must not inspect");
    });
    const input = new Proxy({}, { ownKeys: inspect });
    const lazy = vi.fn(() => input);
    const metadata = vi.fn(() => input);
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "info" },
      recordMetadata: metadata,
    });
    withLogContext(input, () => {
      logger.debug(input, "disabled");
      logger.trace(lazy, "disabled");
      logger.log("debug", input, "disabled");
    });
    const uninstall = installConsoleCapture(logger);
    try {
      console.debug("disabled", input);
    } finally {
      uninstall();
    }
    expect(inspect).not.toHaveBeenCalled();
    expect(lazy).not.toHaveBeenCalled();
    expect(metadata).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it("preserves JSON serialization while redacting getter and toJSON output without mutating cycles or aliases", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const projected = vi.fn(() => ({
      nested: [{ token: "synthetic-json-secret", count: 2 }],
    }));
    const source = { toJSON: projected };
    const shared = Object.freeze({
      password: "synthetic-shared-secret",
      enabled: true,
    });
    const circular: Record<string, unknown> = {
      token: "synthetic-cycle-secret",
      count: 3,
    };
    circular["self"] = circular;
    const input = {
      date: new Date("2026-10-23T00:00:00.000Z"),
      source,
      first: shared,
      second: shared,
      circular,
      get computed() {
        return { nested: { secret: "synthetic-getter-secret", status: 200 } };
      },
      values: [undefined, null, Number.NaN, true, 4],
      omitted: undefined,
    };
    logger.info(input, "serialized");
    logger.info(input, "serialized again");
    expect(projected).toHaveBeenCalledTimes(2);
    for (const record of records) {
      expect(record).toMatchObject({
        date: "2026-10-23T00:00:00.000Z",
        source: { nested: [{ token: "[redacted]", count: 2 }] },
        first: { password: "[redacted]", enabled: true },
        second: { password: "[redacted]", enabled: true },
        circular: { token: "[redacted]", count: 3, self: "[Circular]" },
        computed: { nested: { secret: "[redacted]", status: 200 } },
        values: [null, null, null, true, 4],
      });
      expect(record).not.toHaveProperty("omitted");
    }
    expect(JSON.stringify(records)).not.toContain("synthetic-");
    expect(shared.password).toBe("synthetic-shared-secret");
    expect(circular["self"]).toBe(circular);
    expect(source.toJSON).toBe(projected);
  });

  it("fails closed at depth and total-entry limits without reading beyond the budget", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    let deep: Record<string, unknown> = { token: "synthetic-deep-secret" };
    for (let depth = 0; depth < 40; depth++) deep = { next: deep };
    logger.info({ deep }, "deep");
    const wide: Record<string, unknown> = {};
    for (let index = 0; index < 10_000; index++) wide[`item${index}`] = index;
    const beyondBudget = vi.fn(() => "synthetic-over-budget-secret");
    Object.defineProperty(wide, "last", {
      enumerable: true,
      get: beyondBudget,
    });
    logger.info(wide, "wide");
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record["logRecordOmitted"]).toBe("redaction limit reached");
      expect(JSON.stringify(record)).not.toContain("synthetic-");
    }
    expect(beyondBudget).not.toHaveBeenCalled();
  });

  it.each([
    "ordinary",
    "lazy",
    "ambient",
    "recordMetadata",
    "base",
    "child",
  ] as const)(
    "applies default and custom paths to %s records without mutating source data",
    (source) => {
      const value = Object.freeze({
        details: Object.freeze({
          headers: Object.freeze({
            cookie: "synthetic-cookie-secret",
            authorization: "synthetic-auth-secret",
          }),
          custom: "synthetic-custom-secret",
          count: 2,
        }),
      });
      const { logger, records } = createCapturingLogger({
        env: {},
        redact: {
          paths: ["data.details.custom"],
          remove: true,
          censor: "unsafe custom censor",
        },
        ...(source === "base" ? { base: { data: value } } : {}),
        ...(source === "recordMetadata"
          ? { recordMetadata: () => ({ data: value }) }
          : {}),
      });
      if (source === "ordinary") logger.info({ data: value }, "source");
      if (source === "lazy") logger.info(() => ({ data: value }), "source");
      if (source === "ambient")
        withLogContext({ data: value }, () => logger.info("source"));
      if (["recordMetadata", "base"].includes(source)) logger.info("source");
      if (source === "child") logger.child({ data: value }).info("source");
      expect(records).toHaveLength(1);
      assert.isDefined(records[0]);
      expect(records[0]["data"]).toEqual({
        details: {
          headers:
            source === "recordMetadata"
              ? "[omitted: max depth]"
              : { cookie: "[redacted]", authorization: "[redacted]" },
          custom: "[redacted]",
          count: 2,
        },
      });
      expect(JSON.stringify(records)).not.toContain("synthetic-");
      expect(value.details.custom).toBe("synthetic-custom-secret");
      expect(value.details["headers"].cookie).toBe("synthetic-cookie-secret");
    },
  );

  it("emits only structural console arguments and redacts console record context", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = createForgeLogger({ env: {} });
    const input = {
      batches: [{ credentials: { token: "synthetic-console-secret" } }],
    };
    const uninstall = installConsoleCapture(logger);
    try {
      withLogContext(
        {
          context: {
            nested: { password: "synthetic-context-secret", count: 2 },
          },
        },
        () => {
          console.info("operation", input);
        },
      );
      expect(spy).toHaveBeenCalledOnce();
      assert.isDefined(spy.mock.calls[0]);
      const line = spy.mock.calls[0][0] as string;
      expect(line).not.toContain("synthetic-");
      expect(JSON.parse(line)).toMatchObject({
        msg: "operation",
        consoleArgs: { type: "array", items: 1 },
        context: { nested: { password: "[redacted]", count: 2 } },
      });
    } finally {
      uninstall();
      spy.mockRestore();
    }
  });

  it.each([
    { description: "large string", value: "x".repeat(1_000_001) },
    { description: "sparse array", value: new Array(10_001) },
    {
      description: "many sparse arrays",
      value: Array.from({ length: 200 }, () => new Array(200)),
    },
  ])(
    "fails closed for $description rather than returning unchecked data",
    ({ value }) => {
      const { logger, records } = createCapturingLogger({ env: {} });
      logger.info({ value }, "bounded");
      expect(records[0]).toMatchObject({
        msg: "bounded",
        logRecordOmitted: "redaction limit reached",
      });
      expect(records[0]).not.toHaveProperty("value");
    },
  );

  it("contains inspection failures without exposing exception text and never reads secret getters", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const secretGetter = vi.fn(() => {
      throw new Error("synthetic-secret-getter");
    });
    const input = Object.defineProperty({ status: 200 }, "password", {
      enumerable: true,
      get: secretGetter,
    });
    logger.info(input, "secret accessor");
    logger.info(
      {
        hostile: new Proxy(
          {},
          {
            ownKeys() {
              throw new Error("synthetic-inspection-secret");
            },
          },
        ),
      },
      "unavailable",
    );
    logger.info(
      {
        hostile: {
          toJSON() {
            throw new Error("synthetic-serialization-secret");
          },
        },
      },
      "unavailable",
    );
    expect(records[0]).toMatchObject({ status: 200, password: "[redacted]" });
    expect(secretGetter).not.toHaveBeenCalled();
    for (const record of records.slice(1))
      expect(record["logRecordOmitted"]).toBe("redaction unavailable");
    expect(JSON.stringify(records)).not.toContain("synthetic-");
  });

  it("retains boxed JSON primitives and sparse array positions", () => {
    const { logger, records } = createCapturingLogger({ env: {} });
    const values = new Array(3);
    Object.defineProperty(values, "1", {
      value: { token: "synthetic-array-secret", count: 2 },
    });
    logger.info(
      {
        text: new String("ready"),
        count: new Number(4),
        enabled: new Boolean(false),
        values,
      },
      "json",
    );
    expect(records[0]).toMatchObject({
      text: "ready",
      count: 4,
      enabled: false,
      values: [null, { token: "[redacted]", count: 2 }, null],
    });
  });

  it("skips structural inspection for every disabled console level", () => {
    const inspect = vi.fn(() => {
      throw new Error("must not inspect");
    });
    const input = new Proxy({}, { ownKeys: inspect });
    const { logger, records } = createCapturingLogger({
      env: { LOG_LEVEL: "fatal" },
    });
    const uninstall = installConsoleCapture(logger);
    try {
      console.log(input);
      console.info(input);
      console.warn(input);
      console.error(input);
      console.debug(input);
    } finally {
      uninstall();
    }
    expect(inspect).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it("merges a caller-supplied redact option with the defaults", () => {
    const { logger, records } = createCapturingLogger({
      env: {},
      redact: ["customSecretField"],
    });

    logger.info(
      { customSecretField: "shh", password: "hunter2" },
      "custom + default redaction",
    );

    const record = records[0];
    assert.isDefined(record);
    expect(record["customSecretField"]).toBe("[redacted]");
    expect(record["password"]).toBe("[redacted]");
  });
});

describe("pino's own redaction backstop", () => {
  // Pino matches paths case-sensitively, so only the canonical spellings are
  // guaranteed when something logs through the underlying pino logger directly.
  const headerCasings = ["Authorization", "Cookie", "Set-Cookie"];

  it.each([...secretKeys, ...headerCasings])(
    "censors %s at the top level and one level deep",
    (key) => {
      const { logger, records } = createCapturingLogger();

      unwrapPinoLogger(logger).info({
        [key]: "private",
        nested: { [key]: "private" },
      });

      expect(records[0]).toMatchObject({
        [key]: DEFAULT_REDACTION_CENSOR,
        nested: { [key]: DEFAULT_REDACTION_CENSOR },
      });
    },
  );
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
