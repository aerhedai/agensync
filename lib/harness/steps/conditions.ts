import type { Condition } from "@/lib/harness/steps/schema";
import {
  asNumber,
  resolveOperand,
  type ValueStore,
} from "@/lib/harness/steps/values";

/**
 * Evaluates a `branch` step's condition. Deterministic application code,
 * never the model — the same principle policy-engine.ts applies to
 * permissions, applied to control flow: the LLM produces facts, code
 * decides what happens with them (CLAUDE.md §4.6).
 */
export function evaluateCondition(
  condition: Condition,
  store: ValueStore,
): boolean {
  const left = resolveOperand(condition.left, store);

  if (condition.operator === "exists") {
    return isPresent(left);
  }
  if (condition.operator === "not_exists") {
    return !isPresent(left);
  }

  // Every remaining operator is binary. A missing right-hand side is a
  // config error rather than a silent false, but a branch can't throw
  // mid-run without losing the audit trail, so it resolves to "" and
  // compares honestly — schema validation is what stops it reaching here.
  const right = resolveOperand(condition.right ?? "", store);

  if (condition.operator === "contains") {
    return String(stringify(left))
      .toLowerCase()
      .includes(String(stringify(right)).toLowerCase());
  }

  // Numeric comparison when both sides genuinely are numbers, so
  // "amount > 10000" compares magnitudes rather than string order (where
  // "9" would sort after "10000"). Falls back to string comparison
  // otherwise, which is what makes eq/neq work on text.
  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);
  const bothNumeric = leftNumber !== null && rightNumber !== null;

  switch (condition.operator) {
    case "eq":
      return bothNumeric
        ? leftNumber === rightNumber
        : stringify(left) === stringify(right);
    case "neq":
      return bothNumeric
        ? leftNumber !== rightNumber
        : stringify(left) !== stringify(right);
    case "gt":
      return bothNumeric ? leftNumber > rightNumber : false;
    case "gte":
      return bothNumeric ? leftNumber >= rightNumber : false;
    case "lt":
      return bothNumeric ? leftNumber < rightNumber : false;
    case "lte":
      return bothNumeric ? leftNumber <= rightNumber : false;
  }
}

// "Present" deliberately excludes empty string and empty array: a lookup
// that found nothing stores an empty result, and `exists` on it must be
// false or every optional-lookup branch would take the wrong arm.
function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
