import type { Result } from "@forge-ahead/errors";
import { buildErrorMetadata } from "./errors.js";
import {
  defineLogObjectSummaryPolicy,
  type LogObjectSummaryPolicy,
  summarizeObjectForLog,
} from "./policy.js";
import { isPromiseLike } from "./promise.js";
import {
  type LogValueSummaryOptions,
  summarizeShapeForLog,
} from "./summarize.js";
import type { LogLevelMethods } from "./types.js";

export const FORGE_EVENT_SUMMARY_POLICY = defineLogObjectSummaryPolicy({
  kind: "forgeEvent",
  fields: {
    eventType: "eventType",
    method: "method",
    requestId: "requestId",
    moduleKey: "context.moduleKey",
    functionKey: "call.functionKey",
    appId: "app.id",
    appVersion: "app.version",
    selfGenerated: "selfGenerated",
    headers: {
      path: "headers",
      transform: "omittedShape",
    },
    body: {
      path: "body",
      transform: "omittedShape",
    },
  },
});

export function summarizeForgeInvocation(
  event: unknown,
  options?: LogValueSummaryOptions,
): Record<string, unknown> {
  return summarizeObjectForLog(event, FORGE_EVENT_SUMMARY_POLICY, options);
}

export interface ForgeInvocationLogOptions extends LogValueSummaryOptions {
  level?: "debug" | "info";
  includeEventShape?: boolean;
}

function isVerboseLevelEnabled(logger: LogLevelMethods): boolean {
  return logger.isLevelEnabled("debug");
}

function computeEventShape(
  logger: LogLevelMethods,
  event: unknown,
  options: ForgeInvocationLogOptions | undefined,
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  const isVerbose = isVerboseLevelEnabled(logger);
  if (options?.includeEventShape !== undefined) {
    if (options.includeEventShape) {
      return isVerbose
        ? { eventShape: summarizeShapeForLog(event, options) }
        : { eventShapeOmitted: "requires debug or trace" };
    }
    return {};
  }
  if (env["FORGE_LOG_EVENT_SHAPE"] === "true" && isVerbose) {
    return { eventShape: summarizeShapeForLog(event, options) };
  }
  return {};
}

export function logForgeInvocation(
  logger: LogLevelMethods,
  event: unknown,
  message?: string,
  options?: ForgeInvocationLogOptions,
  env: Record<string, string | undefined> = process.env,
): void {
  const summary = summarizeForgeInvocation(event, options);
  Object.assign(summary, computeEventShape(logger, event, options, env));
  const level = options?.level ?? "info";
  logger[level](summary, message);
}

export interface ForgeInvocationLoggingOptions<T> {
  logEntry?: boolean;
  entryLevel?: "debug" | "info";
  entryMessage?: string;
  includeEventShape?: boolean;
  successLevel?: "debug" | "info";
  errorLevel?: "warn" | "error" | "fatal";
  message?: string;
  successMessage?: string;
  errorMessage?: string;
  summarizeResult?: (result: T) => Record<string, unknown>;
  errorPolicy?: LogObjectSummaryPolicy;
}

function isResult(value: unknown): value is Result<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Result<unknown, unknown>).isOk === "function" &&
    typeof (value as Result<unknown, unknown>).isErr === "function"
  );
}

export function withForgeInvocationLogging<TEvent, TResult>(
  logger: LogLevelMethods,
  event: TEvent,
  handler: (event: TEvent) => TResult | Promise<TResult>,
  options: ForgeInvocationLoggingOptions<TResult> = {},
): TResult | Promise<TResult> {
  const baseMetadata = summarizeForgeInvocation(event);

  if (options.logEntry) {
    logForgeInvocation(
      logger,
      event,
      options.entryMessage ?? "invocation started",
      {
        level: options.entryLevel ?? "info",
        ...(options.includeEventShape === undefined
          ? {}
          : { includeEventShape: options.includeEventShape }),
      },
    );
  }

  const start = Date.now();
  const message = options?.message ?? "invocation completed";

  function logCompletion(
    level: "debug" | "info" | "warn" | "error" | "fatal",
    outcome: "success" | "failure",
    value: TResult | unknown,
    messageText?: string,
  ): void {
    const durationMs = Date.now() - start;
    const metadata: Record<string, unknown> = {
      ...baseMetadata,
      outcome,
      durationMs,
    };
    if (
      outcome === "success" &&
      options?.summarizeResult &&
      value !== undefined
    ) {
      Object.assign(metadata, options.summarizeResult(value as TResult));
    }
    logger[level](metadata, messageText ?? message);
  }

  function logFailure(error: unknown): never {
    logResultError(error);
    throw error;
  }

  function logResultError(err: unknown): void {
    const durationMs = Date.now() - start;
    const metadata = buildErrorMetadata(err, options);
    Object.assign(metadata, baseMetadata, {
      outcome: "failure",
      durationMs,
    });
    const level = options?.errorLevel ?? "error";
    logger[level](metadata, options?.errorMessage ?? message);
  }

  function handleReturn(value: TResult): TResult {
    let resultValue = value;
    if (isResult(value)) {
      if (value.isErr()) {
        logResultError(value.error);
        return value;
      }
      resultValue = value.value as TResult;
    }
    logCompletion(
      options?.successLevel ?? "info",
      "success",
      resultValue,
      options?.successMessage ?? message,
    );
    return value;
  }

  try {
    const result = handler(event);
    if (isPromiseLike(result)) {
      return result.then(handleReturn, logFailure) as
        | TResult
        | Promise<TResult>;
    }
    return handleReturn(result);
  } catch (error) {
    return logFailure(error);
  }
}
