// Deterministic, application-code policy checks — the LLM recommends an
// action, this decides whether it's actually permitted (CLAUDE.md #14).

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

export interface PolicyContext {
  toolName: string;
  toolOutput: Record<string, unknown>;
}

// Tools that mutate external, customer-visible (or otherwise consequential
// and hard-to-undo) state must never run without a human approving the
// exact proposed content first — no amount threshold, no exceptions. Once
// every customer-facing send is gated here, a separate amount-based gate on
// the tool that merely *calculates* the number (e.g. calculate_quote) is
// redundant: it would just pause the same run twice for the same underlying
// decision. Checked before the tool executes (see agent-runtime.ts) —
// approving after the fact can't un-send an email or un-invite a meeting.
//
// notify_slack/notify_teams are deliberately NOT here — they're internal
// notifications to the business's own workspace, not customer-visible or
// consequential the way an email send or a real calendar invite is.
const REQUIRES_APPROVAL_BEFORE_EXECUTION = new Set([
  "send_email",
  "create_calendar_event",
]);

export function requiresApprovalBeforeExecution(toolName: string): boolean {
  return REQUIRES_APPROVAL_BEFORE_EXECUTION.has(toolName);
}

// Post-execution policy: evaluated on a tool's result, for tools with no
// external side effect (safe to run first, then decide whether the run may
// continue). No active rules currently — kept as the extension point
// CLAUDE.md #14 calls for, for whenever a future tool needs one.
export function evaluatePolicy(_context: PolicyContext): PolicyResult {
  return { decision: "ALLOW", reason: "No policy restricts this action." };
}
