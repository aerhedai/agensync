// Deterministic, application-code policy checks — the LLM recommends an
// action, this decides whether it's actually permitted (CLAUDE.md #14).
// This is why calculate_quote's live-Ollama runs got a wrong threshold call
// past a human: the model was never the authority, this is.

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

export interface PolicyContext {
  toolName: string;
  toolOutput: Record<string, unknown>;
}

export const QUOTE_APPROVAL_THRESHOLD_GBP = 10_000;

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

export function evaluatePolicy(context: PolicyContext): PolicyResult {
  if (context.toolName === "calculate_quote") {
    const total = context.toolOutput.total;
    if (typeof total === "number" && total >= QUOTE_APPROVAL_THRESHOLD_GBP) {
      return {
        decision: "REQUIRE_APPROVAL",
        reason: `Quote total ${formatGBP(total)} meets or exceeds the ${formatGBP(QUOTE_APPROVAL_THRESHOLD_GBP)} approval threshold.`,
      };
    }
  }

  return { decision: "ALLOW", reason: "No policy restricts this action." };
}
