import { describe, expect, it } from "vitest";

import {
  evaluatePolicy,
  requiresApprovalBeforeExecution,
} from "@/lib/policies/policy-engine";

describe("requiresApprovalBeforeExecution", () => {
  it("requires approval for send_email regardless of arguments — no amount threshold", () => {
    expect(requiresApprovalBeforeExecution("send_email")).toBe(true);
  });

  it("requires approval for create_calendar_event — a real invite can't be un-sent", () => {
    expect(requiresApprovalBeforeExecution("create_calendar_event")).toBe(true);
  });

  it("does not require approval for internal-only notification tools", () => {
    expect(requiresApprovalBeforeExecution("notify_slack")).toBe(false);
    expect(requiresApprovalBeforeExecution("notify_teams")).toBe(false);
  });

  it("does not require approval for read-only lookup/calculation tools", () => {
    expect(requiresApprovalBeforeExecution("find_customer")).toBe(false);
    expect(requiresApprovalBeforeExecution("find_product")).toBe(false);
    expect(requiresApprovalBeforeExecution("check_inventory")).toBe(false);
    expect(requiresApprovalBeforeExecution("calculate_quote")).toBe(false);
    expect(requiresApprovalBeforeExecution("check_calendar_availability")).toBe(
      false,
    );
  });
});

describe("evaluatePolicy", () => {
  it("allows any tool by default — no post-execution rules are active", () => {
    const result = evaluatePolicy({
      toolName: "calculate_quote",
      toolOutput: { total: 27_000 },
    });

    expect(result.decision).toBe("ALLOW");
  });

  it("allows send_email's own output too — its gate is pre-execution, not output-based", () => {
    const result = evaluatePolicy({
      toolName: "send_email",
      toolOutput: { sent: true },
    });

    expect(result.decision).toBe("ALLOW");
  });
});
