import { describe, expect, it } from "vitest";

import {
  evaluatePolicy,
  QUOTE_APPROVAL_THRESHOLD_GBP,
} from "@/lib/policies/policy-engine";

describe("evaluatePolicy", () => {
  it("allows a quote below the threshold", () => {
    const result = evaluatePolicy({
      toolName: "calculate_quote",
      toolOutput: { total: QUOTE_APPROVAL_THRESHOLD_GBP - 1 },
    });

    expect(result.decision).toBe("ALLOW");
  });

  it("requires approval for a quote at exactly the threshold", () => {
    const result = evaluatePolicy({
      toolName: "calculate_quote",
      toolOutput: { total: QUOTE_APPROVAL_THRESHOLD_GBP },
    });

    expect(result.decision).toBe("REQUIRE_APPROVAL");
    expect(result.reason).toMatch(/£10,000/);
  });

  it("requires approval for a quote above the threshold", () => {
    const result = evaluatePolicy({
      toolName: "calculate_quote",
      toolOutput: { total: 27_000 },
    });

    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });

  it("allows tools other than calculate_quote unconditionally", () => {
    const result = evaluatePolicy({
      toolName: "find_customer",
      toolOutput: { found: true },
    });

    expect(result.decision).toBe("ALLOW");
  });

  it("allows calculate_quote when the total is missing or malformed", () => {
    const result = evaluatePolicy({
      toolName: "calculate_quote",
      toolOutput: {},
    });

    expect(result.decision).toBe("ALLOW");
  });
});
