import { describe, expect, it } from "vitest";

import { runCompute } from "@/lib/harness/steps/compute";
import {
  asDate,
  asList,
  asNumber,
  interpolate,
  resolveOperand,
} from "@/lib/harness/steps/values";

// compute is the one place a business's own configuration turns into a
// computed number that can reach a customer. It must never eval, never
// produce NaN silently, and never leave float dust on money — every case
// below is one of those three properties.

describe("operand resolution", () => {
  const store = {
    quantity: 500,
    customer: { data: { name: "Acme", email: "a@b.test" } },
    records: [{ total: 10 }, { total: 20 }],
  };

  it("resolves a whole reference to its underlying value, preserving type", () => {
    // Arithmetic on a number must not round-trip through a string.
    expect(resolveOperand("{quantity}", store)).toBe(500);
    expect(resolveOperand("{records}", store)).toEqual([
      { total: 10 },
      { total: 20 },
    ]);
  });

  it("treats anything else as a literal or a template", () => {
    expect(resolveOperand("15", store)).toBe("15");
    expect(resolveOperand("Hi {customer.data.name}", store)).toBe("Hi Acme");
  });

  it("walks dotted paths into record data", () => {
    expect(resolveOperand("{customer.data.email}", store)).toBe("a@b.test");
  });

  it("resolves a missing reference to empty rather than leaving {placeholder} text", () => {
    // A half-substituted string reaching a customer is the same class of
    // bug as "[Customer's Name]" — see compose-instructions.ts.
    expect(interpolate("Dear {customer.data.missing},", store)).toBe("Dear ,");
    expect(interpolate("Dear {nobody},", store)).toBe("Dear ,");
  });

  it("does not index into arrays or primitives when walking a path", () => {
    expect(resolveOperand("{records.total}", store)).toBeUndefined();
    expect(resolveOperand("{quantity.length}", store)).toBeUndefined();
  });
});

describe("coercion helpers", () => {
  it("accepts numeric strings but rejects non-numbers", () => {
    expect(asNumber("15.5")).toBe(15.5);
    expect(asNumber(15.5)).toBe(15.5);
    expect(asNumber("")).toBeNull();
    expect(asNumber("abc")).toBeNull();
    expect(asNumber(null)).toBeNull();
    expect(asNumber(Number.NaN)).toBeNull();
    expect(asNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("rejects an unparseable date rather than returning Invalid Date", () => {
    expect(asDate("2026-01-15")?.toISOString()).toBe(
      "2026-01-15T00:00:00.000Z",
    );
    expect(asDate("not a date")).toBeNull();
    expect(asDate(null)).toBeNull();
  });

  it("treats a single value as a one-item list, and nothing as empty", () => {
    expect(asList([1, 2])).toEqual([1, 2]);
    expect(asList(5)).toEqual([5]);
    expect(asList(undefined)).toEqual([]);
  });
});

describe("arithmetic", () => {
  const store = { unitPrice: 15, quantity: 500, price: "12.50" };

  it("multiplies a price by a quantity — the quote pipeline's core sum", () => {
    const result = runCompute("multiply", ["{unitPrice}", "{quantity}"], store);
    expect(result).toEqual({ ok: true, value: 7500 });
  });

  it("rounds money to whole pence rather than leaving float dust", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE-754.
    expect(runCompute("add", ["0.1", "0.2"], {})).toEqual({
      ok: true,
      value: 0.3,
    });
  });

  it("coerces numeric strings, so a record field works as an operand", () => {
    expect(runCompute("multiply", ["{price}", "2"], store)).toEqual({
      ok: true,
      value: 25,
    });
  });

  it("reports which operand was wrong instead of producing NaN", () => {
    const result = runCompute("multiply", ["{unitPrice}", "{missing}"], store);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("{missing}");
  });

  it("refuses to divide by zero", () => {
    const result = runCompute("divide", ["10", "0"], {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/zero/i);
  });

  it("rounds to a requested number of decimal places", () => {
    expect(runCompute("round", ["3.14159", "2"], {})).toEqual({
      ok: true,
      value: 3.14,
    });
    expect(runCompute("round", ["3.7"], {})).toEqual({ ok: true, value: 4 });
  });

  it("rejects a nonsensical decimal place count", () => {
    expect(runCompute("round", ["3.14", "99"], {}).ok).toBe(false);
    expect(runCompute("round", ["3.14", "-1"], {}).ok).toBe(false);
  });
});

describe("text", () => {
  it("builds a string from named values", () => {
    const result = runCompute(
      "template",
      ["Quote for {quantity} x {product}"],
      { quantity: 500, product: "Widget" },
    );
    expect(result).toEqual({ ok: true, value: "Quote for 500 x Widget" });
  });
});

describe("dates", () => {
  const store = { invoiceDate: "2026-01-15T00:00:00.000Z" };

  it("adds days for a due date", () => {
    const result = runCompute("date_add_days", ["{invoiceDate}", "30"], store);
    expect(result).toEqual({
      ok: true,
      value: "2026-02-14T00:00:00.000Z",
    });
  });

  it("adds days in UTC, unaffected by the host machine's timezone or DST", () => {
    // Spanning a UK DST boundary: a local-time implementation would drift
    // an hour here and could shift a due date by a whole day.
    const result = runCompute(
      "date_add_days",
      ["2026-03-28T12:00:00.000Z", "2"],
      {},
    );
    expect(result).toEqual({ ok: true, value: "2026-03-30T12:00:00.000Z" });
  });

  it("diffs two dates in whole days", () => {
    const result = runCompute(
      "date_diff_days",
      ["2026-02-14T00:00:00.000Z", "{invoiceDate}"],
      store,
    );
    expect(result).toEqual({ ok: true, value: 30 });
  });

  it("returns a negative diff when the first date is earlier", () => {
    const result = runCompute(
      "date_diff_days",
      ["{invoiceDate}", "2026-02-14T00:00:00.000Z"],
      store,
    );
    expect(result).toEqual({ ok: true, value: -30 });
  });

  it("formats with an explicit locale, never the host default", () => {
    const result = runCompute("date_format", ["{invoiceDate}"], store);
    expect(result).toEqual({ ok: true, value: "15/01/2026" });
  });

  it("names the bad operand when a date won't parse", () => {
    const result = runCompute("date_add_days", ["{nope}", "30"], {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("{nope}");
  });
});

describe("aggregates", () => {
  const store = {
    invoices: [{ total: "100.50" }, { total: "200.25" }, { total: "99.25" }],
    empty: [],
  };

  it("sums a field across records from a search lookup", () => {
    expect(runCompute("sum", ["{invoices}", "total"], store)).toEqual({
      ok: true,
      value: 400,
    });
  });

  it("averages a field across records", () => {
    expect(runCompute("avg", ["{invoices}", "total"], store)).toEqual({
      ok: true,
      value: 133.33,
    });
  });

  it("counts records", () => {
    expect(runCompute("count", ["{invoices}"], store)).toEqual({
      ok: true,
      value: 3,
    });
    expect(runCompute("count", ["{empty}"], store)).toEqual({
      ok: true,
      value: 0,
    });
  });

  it("sums an empty list to zero, but refuses to average one", () => {
    // Averaging nothing has no correct answer; returning 0 would be a
    // quietly wrong number in a customer-facing figure.
    expect(runCompute("sum", ["{empty}"], store)).toEqual({
      ok: true,
      value: 0,
    });
    expect(runCompute("avg", ["{empty}"], store).ok).toBe(false);
  });

  it("names the offending item when one isn't numeric", () => {
    const result = runCompute("sum", ["{rows}", "total"], {
      rows: [{ total: 10 }, { total: "not a number" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("item 2");
      expect(result.error).toContain("total");
    }
  });
});
