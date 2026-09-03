import type { ComputeOperation } from "@/lib/harness/steps/schema";
import {
  asDate,
  asList,
  asNumber,
  interpolate,
  resolveOperand,
  resolvePath,
  type StepValue,
  type ValueStore,
} from "@/lib/harness/steps/values";

/**
 * Deterministic value derivation for `compute` steps.
 *
 * A fixed operation set dispatched by name — deliberately NOT an
 * expression parser and never `eval` (CLAUDE.md §18: no arbitrary code
 * execution through an agent's configuration). A business composing steps
 * in the UI is trusted input, but "trusted" is not a reason to hand it an
 * interpreter; a closed set of named operations is both safer and
 * produces far better error messages when a config is wrong.
 *
 * Every failure is a returned error, never a thrown exception and never a
 * silent NaN — the step runner turns it into a real RUN_FAILED with the
 * specific operand named, rather than "NaN" surfacing in a customer email.
 */

export type ComputeResult =
  { ok: true; value: StepValue } | { ok: false; error: string };

function requireNumbers(
  operation: string,
  operands: string[],
  store: ValueStore,
  count: number,
): { ok: true; values: number[] } | { ok: false; error: string } {
  if (operands.length < count) {
    return {
      ok: false,
      error: `${operation} needs ${count} value${count === 1 ? "" : "s"}, got ${operands.length}.`,
    };
  }
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = operands[i] ?? "";
    const parsed = asNumber(resolveOperand(raw, store));
    if (parsed === null) {
      return {
        ok: false,
        error: `${operation}: "${raw}" is not a number.`,
      };
    }
    values.push(parsed);
  }
  return { ok: true, values };
}

// Money-safe rounding: arithmetic on prices must not leave IEEE-754 dust
// (0.1 + 0.2 = 0.30000000000000004). Same reasoning that makes
// Product.unitPrice a Decimal in the schema rather than a Float.
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

const MS_PER_DAY = 86_400_000;

/**
 * Sums/averages a list, pulling `field` out of each element when given —
 * so `sum` over a search lookup's records can total one field across them
 * ("total of all open invoices") rather than only working on bare numbers.
 */
function numbersFromList(
  operation: string,
  list: StepValue[],
  field: string | undefined,
): { ok: true; values: number[] } | { ok: false; error: string } {
  const values: number[] = [];
  for (const [index, item] of list.entries()) {
    const target =
      field && field.length > 0
        ? resolvePath({ item } as ValueStore, `item.${field}`)
        : item;
    const parsed = asNumber(target);
    if (parsed === null) {
      return {
        ok: false,
        error: `${operation}: item ${index + 1}${field ? ` field "${field}"` : ""} is not a number.`,
      };
    }
    values.push(parsed);
  }
  return { ok: true, values };
}

export function runCompute(
  operation: ComputeOperation,
  operands: string[],
  store: ValueStore,
): ComputeResult {
  switch (operation) {
    case "add":
    case "subtract":
    case "multiply":
    case "divide": {
      const parsed = requireNumbers(operation, operands, store, 2);
      if (!parsed.ok) return parsed;
      const [a, b] = parsed.values as [number, number];
      if (operation === "divide" && b === 0) {
        return { ok: false, error: "divide: cannot divide by zero." };
      }
      const result =
        operation === "add"
          ? a + b
          : operation === "subtract"
            ? a - b
            : operation === "multiply"
              ? a * b
              : a / b;
      // Two decimals by default: these operations exist mainly for money,
      // and an un-rounded float total is a real correctness problem there.
      return { ok: true, value: roundTo(result, 2) };
    }

    case "round": {
      const parsed = requireNumbers(operation, operands, store, 1);
      if (!parsed.ok) return parsed;
      const decimalsOperand = operands[1];
      const decimals =
        decimalsOperand === undefined
          ? 0
          : asNumber(resolveOperand(decimalsOperand, store));
      if (decimals === null || decimals < 0 || decimals > 10) {
        return {
          ok: false,
          error: "round: decimal places must be a number between 0 and 10.",
        };
      }
      return {
        ok: true,
        value: roundTo(parsed.values[0] as number, Math.trunc(decimals)),
      };
    }

    case "template": {
      const first = operands[0];
      if (first === undefined) {
        return { ok: false, error: "template: needs a template string." };
      }
      return { ok: true, value: interpolate(first, store) };
    }

    case "date_add_days": {
      const dateOperand = operands[0];
      const daysOperand = operands[1];
      if (dateOperand === undefined || daysOperand === undefined) {
        return {
          ok: false,
          error: "date_add_days: needs a date and a number of days.",
        };
      }
      const date = asDate(resolveOperand(dateOperand, store));
      if (!date) {
        return {
          ok: false,
          error: `date_add_days: "${dateOperand}" is not a date.`,
        };
      }
      const days = asNumber(resolveOperand(daysOperand, store));
      if (days === null) {
        return {
          ok: false,
          error: `date_add_days: "${daysOperand}" is not a number.`,
        };
      }
      // Date arithmetic in UTC milliseconds rather than setDate(), which
      // would apply the host machine's timezone and DST rules — a server
      // in a different zone must not shift a due date by a day.
      return {
        ok: true,
        value: new Date(date.getTime() + days * MS_PER_DAY).toISOString(),
      };
    }

    case "date_diff_days": {
      const [laterOperand, earlierOperand] = operands;
      if (laterOperand === undefined || earlierOperand === undefined) {
        return { ok: false, error: "date_diff_days: needs two dates." };
      }
      const later = asDate(resolveOperand(laterOperand, store));
      const earlier = asDate(resolveOperand(earlierOperand, store));
      if (!later) {
        return {
          ok: false,
          error: `date_diff_days: "${laterOperand}" is not a date.`,
        };
      }
      if (!earlier) {
        return {
          ok: false,
          error: `date_diff_days: "${earlierOperand}" is not a date.`,
        };
      }
      return {
        ok: true,
        value: Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY),
      };
    }

    case "date_format": {
      const dateOperand = operands[0];
      if (dateOperand === undefined) {
        return { ok: false, error: "date_format: needs a date." };
      }
      const date = asDate(resolveOperand(dateOperand, store));
      if (!date) {
        return {
          ok: false,
          error: `date_format: "${dateOperand}" is not a date.`,
        };
      }
      const localeOperand = operands[1];
      // Explicit locale, never the host default — a server-side default
      // locale is exactly what caused the hydration mismatch fixed in
      // components/settings/ai-provider-form.tsx.
      const locale =
        localeOperand === undefined
          ? "en-GB"
          : String(resolveOperand(localeOperand, store));
      try {
        return {
          ok: true,
          value: date.toLocaleDateString(locale, { timeZone: "UTC" }),
        };
      } catch {
        return {
          ok: false,
          error: `date_format: "${locale}" is not a valid locale.`,
        };
      }
    }

    case "count": {
      const listOperand = operands[0];
      if (listOperand === undefined) {
        return { ok: false, error: "count: needs a list." };
      }
      return {
        ok: true,
        value: asList(resolveOperand(listOperand, store)).length,
      };
    }

    case "sum":
    case "avg": {
      const listOperand = operands[0];
      if (listOperand === undefined) {
        return { ok: false, error: `${operation}: needs a list.` };
      }
      const list = asList(resolveOperand(listOperand, store));
      const fieldOperand = operands[1];
      const field =
        fieldOperand === undefined
          ? undefined
          : String(resolveOperand(fieldOperand, store));
      const parsed = numbersFromList(operation, list, field);
      if (!parsed.ok) return parsed;
      if (parsed.values.length === 0) {
        // Sum of nothing is 0; average of nothing is undefined, and
        // returning 0 there would be a quietly wrong number.
        return operation === "sum"
          ? { ok: true, value: 0 }
          : { ok: false, error: "avg: cannot average an empty list." };
      }
      const total = parsed.values.reduce((acc, n) => acc + n, 0);
      return {
        ok: true,
        value: roundTo(
          operation === "sum" ? total : total / parsed.values.length,
          2,
        ),
      };
    }
  }
}
