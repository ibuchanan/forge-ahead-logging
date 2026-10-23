import { DEFAULT_REDACTION_CENSOR, isSecretShapedKey } from "./redaction.js";
import type { JSONValue, LogValueSummaryOptions } from "./summarize.js";
import {
  DEFAULT_LOG_VALUE_SUMMARY_OPTIONS,
  summarizeValue,
} from "./summarize.js";

export type LogFieldPath = string | readonly string[];
export type LogFieldTransform =
  | "identity"
  | "redact"
  /** @deprecated Do not preview authorization data. Use redact or omit the field. */
  | "tokenPreview"
  | "omittedShape";

export type LogFieldSelection =
  | LogFieldPath
  | {
      path: LogFieldPath;
      transform?: LogFieldTransform;
    };

export type LogFieldMap = Readonly<Record<string, LogFieldSelection>>;

export interface LogObjectSummaryPolicy {
  kind: string;
  fields: LogFieldMap;
  labels?: LogFieldMap;
  review?: {
    purpose: string;
    indirectIdentifiers:
      | { treatment: "excluded" }
      | { treatment: "retained"; justification: string };
  };
}

/** Options for explicit application projections; verbosity never authorizes labels. */
export interface LogObjectSummaryOptions extends LogValueSummaryOptions {
  /** Include the policy's reviewed labels at this call site; environment toggles do not enable them. */
  includeLabels?: boolean;
}

function isPolicyRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidFieldSelection(selection: unknown): boolean {
  const path = isPolicyRecord(selection) ? selection.path : selection;
  const transform = isPolicyRecord(selection) ? selection.transform : undefined;
  const segments = typeof path === "string" ? path.split(".") : path;
  return (
    Array.isArray(segments) &&
    segments.length > 0 &&
    Array.from(segments).every(
      (segment) => typeof segment === "string" && segment.trim() !== "",
    ) &&
    (transform === undefined ||
      transform === "identity" ||
      transform === "redact" ||
      transform === "omittedShape" ||
      transform === "tokenPreview")
  );
}

export function defineLogObjectSummaryPolicy(
  policy: LogObjectSummaryPolicy,
): LogObjectSummaryPolicy {
  if (!isPolicyRecord(policy)) {
    throw new TypeError("policy must be an object");
  }
  if (typeof policy.kind !== "string" || policy.kind.trim() === "") {
    throw new TypeError("kind must be a nonblank string");
  }
  if (policy.review !== undefined && !isPolicyRecord(policy.review)) {
    throw new TypeError("review must be an object");
  }
  if (
    policy.review !== undefined &&
    (typeof policy.review.purpose !== "string" ||
      policy.review.purpose.trim() === "")
  ) {
    throw new TypeError("review.purpose must be a nonblank string");
  }
  if (policy.review !== undefined) {
    const decision = policy.review.indirectIdentifiers;
    if (
      decision?.treatment !== "excluded" &&
      decision?.treatment !== "retained"
    ) {
      throw new TypeError(
        "review.indirectIdentifiers.treatment must be excluded or retained",
      );
    }
    if (
      decision.treatment === "retained" &&
      (typeof decision.justification !== "string" ||
        decision.justification.trim() === "")
    ) {
      throw new TypeError(
        "review.indirectIdentifiers.justification must be a nonblank string when retained",
      );
    }
  }
  for (const map of ["fields", "labels"] as const) {
    const fields = policy[map];
    if (map === "labels" && fields === undefined) continue;
    if (!isPolicyRecord(fields)) {
      throw new TypeError(`${map} must be a field map`);
    }
    for (const [alias, selection] of Object.entries(fields)) {
      if (!isValidFieldSelection(selection)) {
        throw new TypeError(
          `${map}.${alias} must select a nonempty path and a supported transform (identity, redact, omittedShape, tokenPreview)`,
        );
      }
      const { path, transform } = selectionPathAndTransform(selection);
      if (
        pathSegments(path).some((segment) => isSecretShapedKey(segment, [])) &&
        transform !== "redact" &&
        transform !== "omittedShape"
      ) {
        throw new TypeError(
          `${map}.${alias} selects secret-shaped source path ${JSON.stringify(path)}; use redact or omittedShape, or remove the selection`,
        );
      }
    }
  }
  return policy;
}

function pathSegments(path: LogFieldPath): readonly string[] {
  return typeof path === "string" ? path.split(".") : path;
}

function getAtPath(
  value: unknown,
  path: LogFieldPath,
): { found: boolean; value: unknown } {
  let current: unknown = value;
  for (const segment of pathSegments(path)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !(segment in current)
    ) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

// A named type guard, not an inline condition: TypeScript can't narrow
// `readonly string[]` out of the LogFieldSelection union via Array.isArray()
// in an else-branch, so the exclusion has to be asserted explicitly here.
function hasFieldSelectionPath(
  selection: LogFieldSelection,
): selection is { path: LogFieldPath; transform?: LogFieldTransform } {
  return typeof selection === "object" && !Array.isArray(selection);
}

function selectionPathAndTransform(selection: LogFieldSelection): {
  path: LogFieldPath;
  transform: LogFieldTransform;
} {
  if (hasFieldSelectionPath(selection)) {
    return {
      path: selection.path,
      transform: selection.transform ?? "identity",
    };
  }
  return { path: selection, transform: "identity" };
}

function omittedShapeOf(value: unknown): JSONValue {
  if (typeof value === "string") {
    return { omitted: true, length: value.length };
  }
  if (Array.isArray(value)) {
    return { omitted: true, items: value.length };
  }
  if (value !== null && typeof value === "object") {
    return { omitted: true, keys: Object.keys(value).length };
  }
  return { omitted: true };
}

function applyFieldTransform(
  transform: LogFieldTransform,
  value: unknown,
  options: Required<LogValueSummaryOptions>,
): JSONValue {
  switch (transform) {
    case "redact":
      return DEFAULT_REDACTION_CENSOR;
    case "tokenPreview":
      return typeof value === "string"
        ? `${value.slice(0, 3)}...${value.slice(-3)}`
        : DEFAULT_REDACTION_CENSOR;
    case "omittedShape":
      return omittedShapeOf(value);
    default:
      return summarizeValue(value, options, 0, new Set());
  }
}

function summarizeFieldMap(
  value: unknown,
  fields: LogFieldMap,
  options: Required<LogValueSummaryOptions>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [alias, selection] of Object.entries(fields)) {
    const { path, transform } = selectionPathAndTransform(selection);
    const { found, value: fieldValue } = getAtPath(value, path);
    if (!found) {
      continue;
    }
    result[alias] = applyFieldTransform(transform, fieldValue, options);
  }
  return result;
}

export function summarizeObjectForLog(
  value: unknown,
  policy: LogObjectSummaryPolicy,
  options?: LogObjectSummaryOptions,
  _env: Record<string, string | undefined> = process.env,
): Record<string, unknown> {
  const resolvedOptions: Required<LogValueSummaryOptions> = {
    ...DEFAULT_LOG_VALUE_SUMMARY_OPTIONS,
    ...options,
  };
  const includeLabels = options?.includeLabels === true;
  const labels =
    includeLabels && policy.labels
      ? summarizeFieldMap(value, policy.labels, resolvedOptions)
      : {};
  return {
    kind: policy.kind,
    ...summarizeFieldMap(value, policy.fields, resolvedOptions),
    ...labels,
  };
}
