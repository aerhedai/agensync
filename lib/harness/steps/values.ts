/**
 * The named values a step programme accumulates as it runs, and how an
 * operand string resolves against them.
 *
 * `{name}` or `{name.field}` resolves; anything else is a literal. Same
 * convention entity-status-signal-pipeline.ts already used for folder paths
 * and message templates — generalised here so every step kind shares one
 * resolution rule rather than each inventing its own.
 */

export type StepValue = unknown;
export type ValueStore = Record<string, StepValue>;

const REFERENCE_PATTERN = /\{([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}/g;

/**
 * Walks a dotted path (`customer.data.name`) without ever using indexed
 * access on something that isn't a plain object — a record's `data` bag
 * comes from business-defined fields, so the path may legitimately miss.
 * Returns undefined rather than throwing; callers decide whether a miss
 * matters (a required lookup does, an optional interpolation doesn't).
 */
export function resolvePath(store: ValueStore, path: string): StepValue {
  const segments = path.split(".");
  let current: StepValue = store;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    if (Array.isArray(current)) return undefined;
    current = (current as Record<string, StepValue>)[segment];
  }
  return current;
}

function stringifyValue(value: StepValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

/**
 * Substitutes every `{reference}` in a template. An unresolved reference
 * becomes an empty string rather than being left as literal `{name}` text
 * — a half-substituted string reaching a customer-facing email is exactly
 * the "[Customer's Name]" class of bug compose-instructions.ts already
 * guards against.
 */
export function interpolate(template: string, store: ValueStore): string {
  return template.replace(REFERENCE_PATTERN, (_match, path: string) =>
    stringifyValue(resolvePath(store, path)),
  );
}

/**
 * Resolves an operand that is a *single* whole reference (`"{total}"`) to
 * its underlying value, preserving its type — so arithmetic on a number
 * doesn't round-trip through a string, and an aggregate over a lookup's
 * array of records still sees an array.
 *
 * Anything else (a literal, or a template with surrounding text) resolves
 * through interpolate() and comes back as a string. This split is what
 * lets one operand syntax serve both "multiply these two numbers" and
 * "build this sentence".
 */
export function resolveOperand(operand: string, store: ValueStore): StepValue {
  const whole = /^\{([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}$/.exec(
    operand,
  );
  if (whole?.[1]) {
    return resolvePath(store, whole[1]);
  }
  return interpolate(operand, store);
}

/**
 * Coerces a resolved operand to a number for arithmetic, accepting the
 * string form a literal or an interpolated record field arrives as.
 * Returns null for anything that isn't genuinely numeric, so compute.ts
 * can report which operand was wrong instead of silently producing NaN.
 */
export function asNumber(value: StepValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Coerces to a Date for the date operations. Accepts a real Date, an ISO
 * string, or an epoch number. Returns null rather than an Invalid Date, so
 * a bad value surfaces as a clear step error rather than "NaN" appearing
 * in a customer's email.
 */
export function asDate(value: StepValue): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch;
  }
  if (typeof value === "string") {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Values an aggregate can run over: either a real array (what a `search`
 * lookup stores) or a single value, treated as a one-element list so
 * `count` over one record is 1 rather than an error.
 */
export function asList(value: StepValue): StepValue[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}
