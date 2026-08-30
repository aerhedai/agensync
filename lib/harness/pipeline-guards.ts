/**
 * Deterministic post-generation checks for hardcoded safety invariants.
 *
 * Found necessary by live testing: appending a business's own
 * Agent.instructions *after* a pipeline's hardcoded safety rule in the same
 * prompt string (see compose-instructions.ts's withBusinessGuidance) is
 * NOT a hard enough boundary on its own — a strongly-worded business
 * instruction ("always offer a full refund immediately") got the model to
 * violate the complaints pipeline's "never promise compensation" rule
 * despite it being stated first. Prompt ordering is not enforcement; this
 * module is the actual enforcement, checked after generation, before a
 * reply is ever proposed for send (CLAUDE.md #14 — the LLM recommends,
 * application code decides).
 */
const COMPENSATION_PROMISE_PATTERN =
  /\b(refund\w*|reimburse\w*|replacement\w*|discount\w*|compensat\w*|free (item|product|replacement)|money back|waive[sd]? the (cost|fee))\b/i;

export function containsCompensationPromise(body: string): boolean {
  return COMPENSATION_PROMISE_PATTERN.test(body);
}
